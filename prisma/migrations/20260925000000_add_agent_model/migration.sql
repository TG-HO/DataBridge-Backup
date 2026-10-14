-- ==============================================================================
-- Migration: Add Agent Model for Multi-Agent Semantic Routing (MSSQL Dialect)
-- Target Database: Microsoft SQL Server (2012+) / Azure SQL
-- ==============================================================================

BEGIN TRY
    BEGIN TRANSACTION;

    -- 1. Create [dbo].[Agent] table if not exists
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Agent]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [dbo].[Agent] (
            [id] NVARCHAR(36) NOT NULL,
            [organizationId] NVARCHAR(1000) NOT NULL,
            [connectionId] NVARCHAR(1000) NOT NULL,
            [name] NVARCHAR(1000) NOT NULL,
            [description] NVARCHAR(MAX) NOT NULL,
            [intentKeywords] NVARCHAR(MAX) NOT NULL,
            [systemPrompt] NVARCHAR(MAX) NOT NULL,
            [tableScope] NVARCHAR(MAX) NOT NULL,
            [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_Agent_createdAt] DEFAULT CURRENT_TIMESTAMP,
            [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_Agent_updatedAt] DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT [PK_Agent] PRIMARY KEY CLUSTERED ([id])
        );

        PRINT 'Table [dbo].[Agent] created successfully.';
    END
    ELSE
    BEGIN
        PRINT 'Table [dbo].[Agent] already exists.';
    END

    -- 2. Create Index on organizationId
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[Agent]') AND name = N'Agent_organizationId_idx')
    BEGIN
        CREATE NONCLUSTERED INDEX [Agent_organizationId_idx] ON [dbo].[Agent]([organizationId]);
        PRINT 'Index [Agent_organizationId_idx] created.';
    END

    -- 3. Create Index on connectionId
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[Agent]') AND name = N'Agent_connectionId_idx')
    BEGIN
        CREATE NONCLUSTERED INDEX [Agent_connectionId_idx] ON [dbo].[Agent]([connectionId]);
        PRINT 'Index [Agent_connectionId_idx] created.';
    END

    -- 4. Foreign Key to Organization (Cascade on Delete)
    IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE object_id = OBJECT_ID(N'[dbo].[FK_Agent_Organization_organizationId]') AND parent_object_id = OBJECT_ID(N'[dbo].[Agent]'))
    BEGIN
        ALTER TABLE [dbo].[Agent] WITH CHECK ADD CONSTRAINT [FK_Agent_Organization_organizationId]
            FOREIGN KEY ([organizationId]) REFERENCES [dbo].[Organization]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
        
        ALTER TABLE [dbo].[Agent] CHECK CONSTRAINT [FK_Agent_Organization_organizationId];
        PRINT 'Foreign key [FK_Agent_Organization_organizationId] added.';
    END

    -- 5. Foreign Key to DbConnection (NO ACTION on Delete/Update to prevent MSSQL cyclic cascade error 1785)
    IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE object_id = OBJECT_ID(N'[dbo].[FK_Agent_DbConnection_connectionId]') AND parent_object_id = OBJECT_ID(N'[dbo].[Agent]'))
    BEGIN
        ALTER TABLE [dbo].[Agent] WITH CHECK ADD CONSTRAINT [FK_Agent_DbConnection_connectionId]
            FOREIGN KEY ([connectionId]) REFERENCES [dbo].[DbConnection]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

        ALTER TABLE [dbo].[Agent] CHECK CONSTRAINT [FK_Agent_DbConnection_connectionId];
        PRINT 'Foreign key [FK_Agent_DbConnection_connectionId] added.';
    END

    COMMIT TRANSACTION;
    PRINT 'Migration completed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();

    RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH;
