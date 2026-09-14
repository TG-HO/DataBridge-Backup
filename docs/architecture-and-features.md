# DataBridge AI - Architecture & Core Features

DataBridge AI is an enterprise-grade, multi-tenant Natural Language to SQL (NL-to-SQL) analytics platform. It allows business users and data engineers to query disparate databases (SQL Server, MySQL, PostgreSQL, MongoDB, and Firebase) using conversational plain English, visualize results in real-time charts, and persist query history securely.

---

## 1. System Architecture Diagram

```
+-------------------------------------------------------------------------------+
|                             CLIENT / BROWSER UI                              |
|  +---------------------+  +----------------------+  +----------------------+  |
|  |  AI Query Space     |  | Interactive Grid     |  | Database Connection  |  |
|  |  (Streaming Chat)   |  | Dashboards (Recharts)|  | Settings & Sync      |  |
|  +---------------------+  +----------------------+  +----------------------+  |
+---------------------------------------+---------------------------------------+
                                        | HTTP / REST / Server Actions
+---------------------------------------v---------------------------------------+
|                       NEXT.JS APPLICATION SERVER                              |
|                                                                               |
|  +-------------------------------------------------------------------------+  |
|  | Middleware & Authentication Layer (Auth.js / NextAuth v5 + JWT)         |  |
|  | - Tenant Isolation (orgId, orgName, orgCode, role verification)         |  |
|  | - Whitelisted routes: /login, /register, /forgot-password               |  |
|  +-------------------------------------------------------------------------+  |
|                                       |                                       |
|  +-------------------------+  +-------v----------------+  +----------------+  |
|  | AI NL-to-SQL Engine     |  | Schema RAG Context     |  | Query Runner   |  |
|  | (OpenRouter/Ollama/     |  | Introspects tables,    |  | Decrypts AES   |  |
|  |  NVIDIA NIM/OpenAI)     |  | columns, relationships |  | & runs queries |  |
|  +-------------------------+  +------------------------+  +----------------+  |
+-------------------+-----------------------------------+-----------------------+
                    |                                   |
         Prisma ORM | MSSQL                             | Native Connectors
                    v                                   v
+-----------------------------------+   +---------------------------------------+
|    INTERNAL SYSTEM DATABASE       |   |      TARGET ENTERPRISE DATABASES       |
|    Microsoft SQL Server 2022      |   |  - Microsoft SQL Server (mssql)       |
|  - Users & Credentials (bcrypt)   |   |  - MySQL 8.x (mysql2)                 |
|  - Organizations & Invite Codes   |   |  - PostgreSQL 14+ (pg)                |
|  - Connection Metadata (AES-256)  |   |  - MongoDB (mongodb native driver)    |
|  - Query Sessions & Chat History  |   |  - Google Firebase Firestore (admin)  |
|  - Dashboard Widgets & Layouts    |   +---------------------------------------+
+-----------------------------------+
```

---

## 2. Multi-Tenant Architecture & Security

### Tenant Isolation Model
Every database connection, dashboard widget, query session, and chat message belongs strictly to an **`Organization`**:
* **Organization (`Organization`)**: Defines the tenant workspace with a unique name and an alphanumeric **`inviteCode`** (e.g. `TES-MFGZRW`).
* **Membership (`OrganizationUser`)**: Junction model linking `User` and `Organization` with role-based access control:
  * **`OWNER`**: Can add/remove database connections, trigger schema synchronization, edit organization settings, and copy the Organization Invite Code.
  * **`MEMBER`**: Can execute queries against authorized databases, view dashboards, and maintain their own persistent query history.
* **Invite-Only Registration**: Public organization enumeration is disabled. Users can either create a new organization (becoming its `OWNER`) or join an existing organization by entering the valid `inviteCode`.

### AES-256 Credential Encryption
External database passwords are encrypted at rest using AES-256-CBC with a random 16-byte initialization vector (IV) per entry ([lib/crypto.ts](file:///d:/DataBridge%20AI/lib/crypto.ts)):
* Format in database: `ivHex:cipherHex`
* Plaintext passwords are decrypted exclusively in volatile memory for the duration of query execution and are never logged or transmitted to the client.

---

## 3. The AI NL-to-SQL Engine & RAG Pipeline

When a user submits an operational inquiry (e.g. *"Show top 5 customers by order count in the retail database"*):

1. **Target Selection**: The user selects one or multiple databases in the Query Console.
2. **Schema Retrieval**: The server extracts the target connection's cached **`schemaContext`** (previously introspected tables, column names, data types, and primary/foreign keys).
3. **Prompt Formulation**: The system injects the database dialect (T-SQL, PostgreSQL, MySQL, Mongo Query, or Firestore) and schema context into the AI model's system prompt.
4. **AI Generation**: The configured provider (OpenRouter, NVIDIA NIM, Ollama, or OpenAI) generates safe, optimized read-only queries with markdown explanations.
5. **Execution & Safeguards**:
   - `lib/query-runner.ts` executes the query against the target database.
   - Only `SELECT` / read queries are permitted. Destructive statements (`DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, `TRUNCATE`) are blocked.
6. **Result Synthesis**: Data is returned in JSON format and rendered as interactive data tables, metrics cards, and syntax-highlighted SQL blocks.

---

## 4. Database-Backed Chat Persistence

Prior versions relied on client-side `localStorage`, which lost history upon closing incognito windows or switching browsers. The updated architecture persists full sessions in Microsoft SQL Server:

* **`QuerySession`**: Tracks session metadata (`userId`, `orgId`, `title`, `selectedConnIds`, `updatedAt`).
* **`ChatMessage`**: Stores every user prompt and assistant response (`role`, `content`, `timestamp`, `rawQuery`, `targetedDatabases`, `isError`).
* **Title Auto-Generation**: When a user asks their first question in a session, the system automatically truncates the prompt into a clean 30-character session title.
* **Cross-Device Sync**: Any open tab, incognito session, or secondary device automatically pulls the synchronized query history upon signing in.

---

## 5. Dashboards & Visualization Engine

* **Custom Grid Layout**: Built on `react-grid-layout`, allowing users to drag, resize, and position analytics widgets freely on a responsive grid.
* **Recharts Visualization**: Supports Bar Charts, Line Charts, Area Charts, Pie Charts, and Data Tables with customized dark-mode themes.
* **Export Capabilities**:
  * **PDF Export**: Uses `jspdf` and `html2canvas-pro` to capture clean vector snapshots of dashboards.
  * **Excel / CSV Export**: Uses `xlsx` to export tabular query results with formatted headers.

---

## 6. Supported Database Engines

| Engine | Driver Package | Default Port | Dialect Notes |
| :--- | :--- | :--- | :--- |
| **Microsoft SQL Server** | `mssql` / `tedious` | `1433` | T-SQL syntax, `TOP N`, schema context defaults to `dbo` |
| **PostgreSQL** | `pg` | `5432` | Postgres syntax, `LIMIT N`, schema context defaults to `public` |
| **MySQL / MariaDB** | `mysql2` | `3306` | MySQL syntax, backtick quoting, `LIMIT N` |
| **MongoDB** | `mongodb` | `27017` | MQL (MongoDB Query Language), JSON filter & projection |
| **Firebase Firestore** | `firebase-admin` | `443` | Collection-based document querying |
