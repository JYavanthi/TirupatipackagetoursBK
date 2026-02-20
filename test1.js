














const express = require("express");
const sql = require("mssql");

const app = express();
const PORT =   5002;


// ✅ Update this with your correct DB details
const config = {
  user: "sqladmin", // RDS master username
  password: "Sanchar6t1", // RDS master password
  server: "sqldatabase01.cx204wkac5t2.ap-south-1.rds.amazonaws.com", // your RDS endpoint
  port: 1433,
  database: "Sanchar6T_Dev", // ✅ your actual DB name
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};





// ✅ 1. Test database connection
app.get("/api/test-connection", async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query("SELECT GETDATE() AS CurrentTime;");
    res.json({
      success: true,
      message: "Connected successfully to RDS SQL Server!",
      data: result.recordset,
    });
  } catch (err) {
    console.error("❌ Connection failed:", err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    sql.close();
  }
});

// ✅ 2. List all tables
app.get("/api/tables", async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
    `);
    res.json({ success: true, tables: result.recordset });
  } catch (err) {
    console.error("❌ Error fetching tables:", err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    sql.close();
  }
});

// ✅ 3. List all views
app.get("/api/views", async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME 
      FROM INFORMATION_SCHEMA.VIEWS
    `);
    res.json({ success: true, views: result.recordset });
  } catch (err) {
    console.error("❌ Error fetching views:", err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    sql.close();
  }
});

// ✅ 4. List all stored procedures
app.get("/api/stored-procedures", async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query(`
      SELECT SPECIFIC_SCHEMA, SPECIFIC_NAME 
      FROM INFORMATION_SCHEMA.ROUTINES 
      WHERE ROUTINE_TYPE = 'PROCEDURE'
    `);
    res.json({ success: true, procedures: result.recordset });
  } catch (err) {
    console.error("❌ Error fetching stored procedures:", err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    sql.close();
  }
});

// ✅ 5. Fetch top 10 rows from a given table
app.get("/api/data/:tableName", async (req, res) => {
  const { tableName } = req.params;
  try {
    const pool = await sql.connect(config);
    const result = await pool
      .request()
      .query(`SELECT TOP 10 * FROM [${tableName}]`);
    res.json({ success: true, table: tableName, data: result.recordset });
  } catch (err) {
    console.error("❌ Error fetching data:", err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    sql.close();
  }
});

// ✅ Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
