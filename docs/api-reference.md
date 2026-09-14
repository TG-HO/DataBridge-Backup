# DataBridge AI - API Reference

This document provides a comprehensive reference for all HTTP REST endpoints and server actions available in DataBridge AI.

---

## 1. Authentication & Tenant Endpoints

### 1.1 Register Account & Organization
* **Path:** `/api/auth/register`
* **Method:** `POST`
* **Authentication:** Public

#### Mode 1: Create New Organization (User becomes `OWNER`)
**Request Body:**
```json
{
  "name": "Sarah Connor",
  "email": "sarah@cyberdyne.io",
  "password": "StrongPassword123!",
  "organizationMode": "create",
  "organizationName": "Cyberdyne Systems"
}
```
**Response (201 Created):**
```json
{
  "success": true,
  "message": "User and Organization created successfully",
  "user": {
    "id": "cm...",
    "name": "Sarah Connor",
    "email": "sarah@cyberdyne.io"
  },
  "organization": {
    "id": "cm...",
    "name": "Cyberdyne Systems",
    "inviteCode": "CYB-89X2A1",
    "role": "OWNER"
  }
}
```

#### Mode 2: Join Existing Organization (User becomes `MEMBER`)
**Request Body:**
```json
{
  "name": "John Connor",
  "email": "john@cyberdyne.io",
  "password": "StrongPassword123!",
  "organizationMode": "join",
  "orgCode": "CYB-89X2A1"
}
```
**Response (201 Created):**
```json
{
  "success": true,
  "message": "User registered and joined organization successfully",
  "user": {
    "id": "cm...",
    "name": "John Connor",
    "email": "john@cyberdyne.io"
  },
  "organization": {
    "id": "cm...",
    "name": "Cyberdyne Systems",
    "inviteCode": "CYB-89X2A1",
    "role": "MEMBER"
  }
}
```

---

### 1.2 Reset Account Password
* **Path:** `/api/auth/reset-password`
* **Method:** `POST`
* **Authentication:** Public (Verified via Email + Org Code)

**Request Body:**
```json
{
  "email": "usman.khan@tajgasoli",
  "orgCode": "TES-MFGZRW",
  "newPassword": "1234567890"
}
```
**Response (200 OK):**
```json
{
  "success": true,
  "message": "Password has been successfully updated. You can now log in."
}
```
**Error Responses:**
* `400`: Missing fields or password length < 6.
* `404`: User or Organization not found.
* `403`: User exists but does not belong to the specified organization.

---

### 1.3 Get Current Organization Details
* **Path:** `/api/organizations`
* **Method:** `GET`
* **Authentication:** Required (Session Cookie)

**Response (200 OK):**
```json
{
  "organization": {
    "id": "cmtlcb5qe0001bkacmo4r8fvl",
    "name": "Test Org",
    "inviteCode": "TES-MFGZRW",
    "role": "OWNER",
    "_count": {
      "members": 2,
      "dbConnections": 6
    }
  }
}
```

---

## 2. Chat & Query Persistence Endpoints

### 2.1 Fetch All Query Sessions
* **Path:** `/api/chat/sessions`
* **Method:** `GET`
* **Authentication:** Required

Returns all query sessions and associated messages for the authenticated user and active organization, sorted by `updatedAt` descending.

**Response (200 OK):**
```json
{
  "sessions": [
    {
      "id": "cmtl...",
      "title": "Top Customers Inquiry",
      "createdAt": 1726300000000,
      "updatedAt": 1726301200000,
      "selectedConnIds": ["cmtlcinxv0001bkpo7gb0dmih"],
      "messages": [
        {
          "id": "msg-1",
          "role": "user",
          "content": "List top 10 customers",
          "timestamp": "12:30 PM"
        },
        {
          "id": "msg-2",
          "role": "assistant",
          "content": "Here are the top 10 customers...",
          "timestamp": "12:30 PM",
          "rawQuery": "SELECT TOP 10 * FROM Customers"
        }
      ]
    }
  ]
}
```

---

### 2.2 Create New Query Session
* **Path:** `/api/chat/sessions`
* **Method:** `POST`
* **Authentication:** Required

**Request Body:**
```json
{
  "title": "New Business Inquiry",
  "selectedConnIds": ["cmtlcinxv0001bkpo7gb0dmih"]
}
```
**Response (201 Created):**
```json
{
  "session": {
    "id": "session-id",
    "title": "New Business Inquiry",
    "createdAt": 1726300000000,
    "updatedAt": 1726300000000,
    "selectedConnIds": ["cmtlcinxv0001bkpo7gb0dmih"],
    "messages": [
      {
        "id": "welcome-msg-id",
        "role": "assistant",
        "content": "## Executive Database Assistant Ready...",
        "timestamp": "Active"
      }
    ]
  }
}
```

---

### 2.3 Delete Query Session
* **Path:** `/api/chat/sessions?id=[sessionId]`
* **Method:** `DELETE`
* **Authentication:** Required

Deletes the session and cascades deletion of all associated chat messages from SQL Server.

**Response (200 OK):**
```json
{
  "success": true
}
```

---

### 2.4 Append Message & Update Session
* **Path:** `/api/chat/sessions/[id]/messages`
* **Method:** `POST`
* **Authentication:** Required

**Request Body (Batch sync or append single):**
```json
{
  "title": "Updated Session Title",
  "selectedConnIds": ["conn-1", "conn-2"],
  "messages": [
    {
      "id": "msg-123",
      "role": "user",
      "content": "How many transactions occurred today?",
      "timestamp": "12:45 PM"
    }
  ]
}
```
**Response (200 OK):**
```json
{
  "success": true,
  "syncedCount": 1
}
```

---

## 3. Server Actions (`app/actions/db-connections.ts`)

These React Server Actions are invoked directly from client components:

| Action Name | Arguments | Description |
| :--- | :--- | :--- |
| **`createDbConnection(data)`** | `name, dbType, host, port, dbName, username, password, schemaContext` | Validates parameters, encrypts password with AES-256, tests connection, and persists profile. |
| **`testDbConnection(data)`** | `dbType, host, port, dbName, username, password` | Tests live socket connectivity and authentication without persisting. |
| **`syncDatabaseSchema(connId)`** | `connectionId` | Introspects tables, columns, data types, and primary keys; writes serialized markdown context to `schemaContext`. |
| **`deleteDbConnection(connId)`** | `connectionId` | Deletes a connection profile (requires `OWNER` role). |
| **`getOrgContextAndConnections()`** | `void` | Returns current user's organization name, `inviteCode`, role, and list of connection profiles. |
