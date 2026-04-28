const express = require("express");
const sql = require("mssql");
const moment = require("moment-timezone");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const { StandardCheckoutClient,
  Env,
  StandardCheckoutPayRequest,
  MetaInfo } = require("pg-sdk-node");
const { randomUUID } = require("crypto");

//const pdf = require("html-pdf-node");
// const puppeteer = require("puppeteer-core");
// const path = require("path");
// const chromium = require("@sparticuz/chromium");

const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
require("dotenv").config();

// meera
const chatRoute = require("./chat/chatRoute");
const { init: initSearchEngine } = require("./chat/searchEngine");


const app = express();
//app.use(cors());
app.use(
  cors({
    origin: [
      "https://www.tirupatipackagetours.com",
      "https://tirupatipackagetours.com",
      "https://dev.tirupatipackagetours.com",
      "http://localhost:8080",
      "http://localhost:8081"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());

app.use(express.json());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// ── MEERA CHAT ROUTE ──
app.use("/api", chatRoute);

const PORT = Number(process.env.PORT) || 5000;

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

const clientId = process.env.PHONEPE_CLIENT_ID;
const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
const clientVersion = 1;
const enviroment = process.env.ENVIRONMENT == "dev" ? Env.SANDBOX : Env.PRODUCTION;

const client = StandardCheckoutClient.getInstance(
  clientId,
  clientSecret,
  clientVersion,
  enviroment,
);




// const dbConfig = {
//   user: process.env.DB_USER,       
//   password: process.env.DB_PASSWORD,
//   server: process.env.DB_SERVER,   
//   port: parseInt(process.env.DB_PORT),  // <-- use port from .env
//   database: process.env.DB_NAME,
//   options: {
//     encrypt: false,                // false for local dev
//     trustServerCertificate: true
//   },
//   pool: {
//     max: 10,
//     min: 0,
//     idleTimeoutMillis: 30000
//   }
// };


// ✅ 1. Test database connection
app.get("/api/test-connection", async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);
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

app.get("/", (req, res) => {
  res.send("✅ Server is running");
});

// ------------------- OTP SETUP -------------------
let otpStore = {}; // Use Redis or DB in production

// ------------------- HELPERS -------------------
function safeDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

// ------------------- ROUTES -------------------

// Send OTP
app.post("/api/send-otp", async (req, res) => {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = otp;

  try {
    await transporter.sendMail({
      from: `"Sanchar6T Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your One-Time Password (OTP) Verification",
      html: `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <h2>Hello ${name || "User"},</h2>
          <p>Your OTP is:</p>
          <h1 style="letter-spacing: 3px; color: #3D85C6;">${otp}</h1>
          <p>Valid for <b>5 minutes</b>.</p>
        </div>
      `,
    });
    console.log(`OTP sent to ${email}: ${otp}`);
    res.json({ success: true, message: "OTP sent" });
  } catch (err) {
    console.error("OTP error:", err);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

// Itinerary generation
app.post("/itinerary", async (req, res) => {
  try {
    const { city, days } = req.body;
    const prompt = `Plan a ${days}-day itinerary for ${city}. Include timings, places, meals, transport, fun activities.`;

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a travel itinerary planner." },
          { role: "user", content: prompt },
        ],
        max_tokens: 1200,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    let itineraryText = response.data.choices[0].message.content;
    itineraryText = itineraryText.replace(/#+\s?/g, "").replace(/\*\*/g, "");
    itineraryText = itineraryText.replace(/(Day\s*\d+)/gi, `<h3 style="color:#226cb2;">$1</h3>`);

    res.json({ itinerary: itineraryText });
  } catch (err) {
    console.error(err.message, err.response?.data);
    res.status(500).json({ error: "Failed to generate itinerary" });
  }
});

// ------------------- BUS BOOKING DETAILS -------------------

// Get bus booking detail by ID
app.get("/api/bus-booking-details/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input("BusBooKingDetailID", sql.Int, id)
      .query("SELECT * FROM [dbo].[BusBookingDetails] WHERE BusBooKingDetailID = @BusBooKingDetailID");
    if (!result.recordset.length) return res.status(404).json({ message: "Not found" });
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch bus booking detail" });
  }
});

// Insert bus booking detail
app.post("/api/bus-booking-details", async (req, res) => {
  try {
    const { OperatorID, PackageID, WkEndSeatPrice, WkDaySeatPrice, DepartureTime, Arrivaltime, Status, CreatedBy } = req.body;
    const pool = await sql.connect(dbConfig);

    await pool.request()
      .input("Flag", sql.Char(1), "I")
      .input("BusBooKingDetailID", sql.Int, 0)
      .input("OperatorID", sql.Int, OperatorID)
      .input("PackageID", sql.Int, PackageID)
      .input("WkEndSeatPrice", sql.Numeric(18, 0), WkEndSeatPrice)
      .input("WkDaySeatPrice", sql.Numeric(18, 0), WkDaySeatPrice)
      .input("DepartureTime", sql.DateTime, safeDate(DepartureTime))
      .input("Arrivaltime", sql.DateTime, safeDate(Arrivaltime))
      .input("AvaialbleSeats", sql.DateTime, null)
      .input("Status", sql.VarChar(250), Status)
      .input("CreatedBy", sql.Int, CreatedBy)
      .execute("sp_BusBookingDetails");

    res.status(201).json({ message: "Bus booking detail created successfully" });
  } catch (err) {
    console.error("SQL INSERT error:", err);
    res.status(500).json({ error: err.message });
  }
});

///////////////////////////////////////














app.get("/api/bus-details", async (req, res) => {
  try {
    const { packageId, journeyDate } = req.query;

    if (!journeyDate) {
      return res.status(400).json({ error: "journeyDate is required" });
    }

    const pool = await sql.connect(dbConfig);
    const request = pool.request();
    request.input("journeyDate", sql.Date, journeyDate);

    let query = `
      SELECT 
        b.BusBooKingDetailID,
        b.OperatorID,
        b.PackageID,
        b.DepartureTime,
        b.Arrivaltime,
        b.BusNo,
        b.BusSeats,
        b.BusType,

        -- Calculate Final Price
        ISNULL(
          sp.SpecialPrice,  
          CASE 
            WHEN wc.DayName IS NOT NULL 
              THEN pc.WeekendPrice
            ELSE pc.WeekdayPrice
          END
        ) AS FinalSeatPrice,

        a.AMName
      FROM vw_BusBookingDetails b
      LEFT JOIN BusPriceConfig pc 
          ON b.BusBooKingDetailID = pc.BusBookingDetailID
          AND pc.IsActive = 1

      LEFT JOIN BusSpecialPrice sp 
          ON b.BusBooKingDetailID = sp.BusBookingDetailID
          AND sp.PriceDate = @journeyDate

      LEFT JOIN WeekendConfig wc
          ON wc.DayName = DATENAME(WEEKDAY, @journeyDate)

      LEFT JOIN vw_BusAmenities a 
          ON b.OperatorID = a.BusOperatorID

      LEFT JOIN vw_BusOperator o 
          ON b.OperatorID = o.BusOperatorID

      WHERE 
          o.SourceSystem in ('TirupatiPackage' , 'TirupatiMantralaya')  
          AND b.Status = 1  
    `;

    if (packageId) {
      query += " AND b.PackageID = @packageId";
      request.input("packageId", sql.Int, packageId);
    }

    query += " ORDER BY b.DepartureTime";

    const result = await request.query(query);

    const buses = {};
    result.recordset.forEach(row => {
      if (!buses[row.BusBooKingDetailID]) {
        buses[row.BusBooKingDetailID] = {
          BusBooKingDetailID: row.BusBooKingDetailID,
          OperatorID: row.OperatorID,
          PackageID: row.PackageID,
          BusNo: row.BusNo,
          BusSeats: row.BusSeats,
          BusType: row.BusType,
          DepartureTime: row.DepartureTime,
          Arrivaltime: row.Arrivaltime,
          FinalSeatPrice: row.FinalSeatPrice,
          amenities: []
        };
      }
      if (row.AMName) {
        buses[row.BusBooKingDetailID].amenities.push(row.AMName);
      }
    });

    res.json(Object.values(buses));

  } catch (err) {
    console.error("Error fetching bus details:", err);
    res.status(500).json({ error: "Server error fetching bus details" });
  }
});

app.get("/bus-booking-details/by-operator-package/:operatorId/:packageId", async (req, res) => {
  const { operatorId, packageId } = req.params;

  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input("operatorId", sql.Int, operatorId)
      .input("packageId", sql.Int, packageId)
      .query(`
        SELECT TOP 1 BusBooKingDetailID 
        FROM BusBookingDetails
        WHERE OperatorID = @operatorId AND PackageID = @packageId
        ORDER BY CreatedDt DESC
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Not found", busBookingDetailId: null });
    }

    res.json({ busBookingDetailId: result.recordset[0].BusBooKingDetailID });
  } catch (err) {
    console.error("Error fetching BusBookingDetailID", err);
    res.status(500).json({ error: "Server error" });
  }
});




app.get("/api/bus/seatLayout", async (req, res) => {
  try {
    const { busId, journeyDate } = req.query; // busId = BusBookingDetailID

    if (!busId || !journeyDate) {
      return res.status(400).json({
        success: false,
        message: "BusBookingDetailsID and Journey Date are required",
      });
    }

    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input("BusId", sql.Int, busId)
      .input("JourneyDate", sql.Date, journeyDate)
      .query(`
        SELECT 
          bbd.WkDaySeatPrice AS weekday,
          bbd.WkEndSeatPrice AS weekend,
          bo.BusSeats,
          bo.FemaleSeatNo,

          -- ==================================
          -- BOOKED seats
          -- ==================================
          (SELECT STRING_AGG(SeatNo, ',') 
           FROM BusBookingSeat bbs 
           WHERE bbs.BusBookingDetailsID = @BusId
             AND bbs.Status = 'Booked'
             AND CAST(bbs.JourneyDate AS DATE) = CAST(@JourneyDate AS DATE)
          ) AS bookedSeats,

          -- ==================================
          -- LOCKED seats
          -- ==================================
          (SELECT STRING_AGG(SeatNo, ',') 
           FROM SeatLock sl 
           WHERE sl.BusBookingDetailsID = @BusId
             AND CAST(sl.JourneyDate AS DATE) = CAST(@JourneyDate AS DATE)
             AND sl.ExpiresAt > GETUTCDATE()
          ) AS lockedSeats,

          -- ==================================
          -- BLOCKED seats (new table)
          -- ==================================
          (SELECT BlockedSeats
           FROM BusBlockedSeats bbs2
           WHERE bbs2.BusBookingDetailID = @BusId
             AND bbs2.JourneyDate = @JourneyDate
             AND (bbs2.BlockExpiresAt IS NULL OR bbs2.BlockExpiresAt > GETUTCDATE())
          ) AS blockedSeats

        FROM BusBookingDetails bbd
        JOIN BusOperator bo ON bo.BusOperatorID = bbd.OperatorID
        WHERE bbd.BusBooKingDetailID = @BusId;
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ success: false, message: "Bus not found" });
    }

    const data = result.recordset[0];

    // Convert CSV → arrays
    const bookedSeats = data.bookedSeats ? data.bookedSeats.split(",").map(s => s.trim()) : [];
    const lockedSeats = data.lockedSeats ? data.lockedSeats.split(",").map(s => s.trim()) : [];
    const blockedSeats = data.blockedSeats ? data.blockedSeats.split(",").map(s => s.trim()) : [];

    // Remaining seats
    const remainingSeats =
      data.BusSeats -
      bookedSeats.length -
      lockedSeats.length -
      blockedSeats.length;

    // Final Response
    res.json({
      success: true,
      price: {
        weekday: Number(data.weekday) || 0,
        weekend: Number(data.weekend) || 0,
      },
      bookedSeats,
      lockedSeats,
      blockedSeats,
      remainingSeats,
      femaleSeatNo: data.FemaleSeatNo || null,
    });

  } catch (error) {
    console.error("❌ Error in seatLayout:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

////////////////////////////////




app.post("/api/bus-booking-seat", async (req, res) => {
  try {
    const payload = req.body;

    if (!payload.JourneyDate) {
      return res.status(400).json({
        success: false,
        message: "JourneyDate is required",
      });
    }

    const pool = await sql.connect(dbConfig);
    const proc = "dbo.sp_BusBookingSeat";
    const saveFlag = payload.SavePassengerDetails === "Y" ? "Yes" : "No";

    const seats = Array.isArray(payload.SeatNo) ? payload.SeatNo : [payload.SeatNo];

    const safeDate = (date) => {
      if (!date) return null;
      if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
      const d = new Date(date);
      if (isNaN(d.getTime())) return null;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    let lastInsertedSeatId = null;
    let bookingdtlsId = null;
    let userIdFromSP = null;

    // 🚀 Insert for each seat
    for (const seat of seats) {
      const request = pool.request();

      request.input("Flag", sql.Char(1), "I");
      request.input("BusBookingSeatID", sql.Int, payload.BusBookingSeatID ?? 0);
      request.input("BusBookingDetailsID", sql.Int, payload.BusBookingDetailsID);
      request.input("BusOperatorID", sql.Int, payload.BusOperatorID);
      request.input("UserID", sql.Int, payload.UserID === 0 ? null : payload.UserID);

      request.input("ForSelf", sql.Bit, payload.ForSelf ? 1 : 0);
      request.input("IsPrimary", sql.Int, payload.IsPrimary ?? 1);
      request.input("SeatNo", sql.NVarChar(50), seat);
      request.input("FirstName", sql.VarChar(250), payload.FirstName ?? null);
      request.input("MiddleName", sql.VarChar(250), payload.MiddleName ?? null);
      request.input("LastName", sql.VarChar(250), payload.LastName ?? null);
      request.input("Email", sql.VarChar(150), payload.Email ?? null);
      request.input("ContactNo", sql.VarChar(50), payload.ContactNo ?? null);
      request.input("Gender", sql.VarChar(50), payload.Gender ?? null);

      request.input("AadharNo", sql.VarChar(20), payload.AadharNo ?? null);
      request.input("PancardNo", sql.VarChar(20), payload.PancardNo ?? null);
      request.input("BloodGroup", sql.VarChar(10), payload.BloodGroup ?? null);
      request.input("DOB", sql.DateTime, safeDate(payload.DOB));
      request.input("FoodPref", sql.VarChar(100), payload.FoodPref ?? null);
      request.input("Disabled", sql.Bit, payload.Disabled ? 1 : 0);
      request.input("Pregnant", sql.Bit, payload.Pregnant ? 1 : 0);
      request.input("RegisteredCompanyNumber", sql.VarChar(50), payload.RegisteredCompanyNumber ?? null);
      request.input("RegisteredCompanyName", sql.VarChar(50), payload.RegisteredCompanyName ?? null);

      request.input("DrivingLicence", sql.VarChar(100), payload.DrivingLicence ?? null);
      request.input("PassportNo", sql.VarChar(100), payload.PassportNo ?? null);
      request.input("RationCard", sql.VarChar(100), payload.RationCard ?? null);
      request.input("VoterID", sql.VarChar(100), payload.VoterID ?? null);
      request.input("Others", sql.VarChar(500), payload.Others ?? null);

      request.input("NRI", sql.Bit, payload.NRI ? 1 : 0);
      request.input("CreatedBy", sql.Int, payload.CreatedBy ?? 1);
      request.input("SavePassengerDetails", sql.VarChar(50), saveFlag);
      request.input("JourneyDate", sql.Date, payload.JourneyDate);

      const result = await request.execute(proc);

      const row = result.recordset?.[0];

      if (row?.BusBookingSeatID) lastInsertedSeatId = row.BusBookingSeatID;
      if (row?.BookingdtlsID) bookingdtlsId = row.BookingdtlsID;
      if (row?.UserID) userIdFromSP = row.UserID;
    }

    return res.status(201).json({
      success: true,
      message: "Booking saved successfully for given JourneyDate",
      BusBookingSeatID: lastInsertedSeatId,
      BookingdtlsID: bookingdtlsId,       // ⬅️ REQUIRED
      UserID: userIdFromSP,               // optional
    });

  } catch (err) {
    console.error("❌ SQL INSERT error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/seat/lock", async (req, res) => {
  const { busBookingId, seatNo, sessionId, journeyDate1 } = req.body;

  // ⚠️ Basic validation
  if (!busBookingId || !seatNo || !sessionId || !journeyDate1) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields (busBookingId, seatNo, sessionId, journeyDate1)",
    });
  }

  try {
    const pool = await sql.connect(dbConfig);
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    const request = new sql.Request(transaction);

    // 2️⃣ Check if seat is already locked
    request.input("BusBookingDetailsID", sql.Int, busBookingId);
    request.input("SeatNo", sql.VarChar(50), seatNo);
    request.input("JourneyDate", sql.Date, journeyDate1);

    const checkLock = await request.query(`
      SELECT TOP 1 1 
      FROM SeatLock 
      WHERE BusBookingDetailsID = @BusBookingDetailsID
        AND SeatNo = @SeatNo
        AND CAST(JourneyDate AS DATE) = @JourneyDate
        AND ExpiresAt > GETDATE();
    `);

    if (checkLock.recordset.length > 0) {
      await transaction.rollback();
      return res.status(200).json({
        success: false,
        message: `🚫 Seat ${seatNo} is already locked for this journey date.`,
      });
    }

    // 3️⃣ Check if seat is already booked
    const checkBooked = await request.query(`
      SELECT TOP 1 1 
      FROM BusBookingSeat
      WHERE BusBookingDetailsID = @BusBookingDetailsID
        AND SeatNo = @SeatNo
        AND CAST(JourneyDate AS DATE) = @JourneyDate
        AND Status IN ('Booked', 'Pending');
    `);

    if (checkBooked.recordset.length > 0) {
      await transaction.rollback();
      return res.status(200).json({
        success: false,
        message: `🚫 Seat ${seatNo} is already booked or pending confirmation.`,
      });
    }

    // 4️⃣ Insert seat lock
    const lockMinutes = 10;

    const insertRequest = new sql.Request(transaction);
    insertRequest.input("BusBookingDetailsID", sql.Int, busBookingId);
    insertRequest.input("SeatNo", sql.VarChar(50), seatNo);
    insertRequest.input("SessionID", sql.VarChar(100), sessionId);
    insertRequest.input("JourneyDate", sql.Date, journeyDate1);
    insertRequest.input("LockMinutes", sql.Int, lockMinutes);

    await insertRequest.query(`
      INSERT INTO SeatLock (BusBookingDetailsID, SeatNo, SessionID, JourneyDate, ExpiresAt)
      VALUES (@BusBookingDetailsID, @SeatNo, @SessionID, @JourneyDate, DATEADD(MINUTE, @LockMinutes, GETDATE()));
    `);

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `✅ Seat ${seatNo} locked successfully for journey date ${journeyDate1}`,
      expiresInMinutes: lockMinutes,
    });
  } catch (err) {
    console.error("❌ Seat Lock Error:", err);
    try {
      if (transaction && transaction._aborted !== true) await transaction.rollback();
    } catch (rollbackErr) {
      console.error("⚠️ Transaction rollback error:", rollbackErr);
    }

    return res.status(500).json({
      success: false,
      message: "Internal error while locking seat",
      error: err.message,
    });
  }
});

app.post("/api/seat/unlock", async (req, res) => {
  const { busBookingId, seatNo, sessionId } = req.body;

  try {
    const pool = await sql.connect(dbConfig);
    const request = pool.request();

    // Only unlock if the same session locked it
    await request.query(`
      DELETE FROM SeatLock
      WHERE BusBookingDetailsID = ${busBookingId} AND SeatNo = '${seatNo}' AND SessionID = '${sessionId}'
    `);

    return res.json({ success: true, message: "Seat unlocked" });
  } catch (err) {
    console.error("Unlock error:", err);
    return res.status(500).json({ success: false, message: "Unlock error" });
  }
});

app.post("/api/user/get-or-create", async (req, res) => {
  try {
    const {
      FirstName,
      MiddleName,
      LastName,
      Email,
      ContactNo,
      Gender,
      Age,
      AadharNo,
      PancardNo,
      BloodGroup,
      DOB,
      FoodPref,
      Disabled,
      DrivingLicence,
      PassportNo,
      RationCard,
      VoterID,
      Others,
      NRI,
      CreatedBy
    } = req.body;

    const pool = await sql.connect(dbConfig);

    // 1️⃣ Check if contact exists
    const existing = await pool.request()
      .input("ContactNo", sql.VarChar, ContactNo)
      .query(`
        SELECT UserID 
        FROM SavedPassengerDtls
        WHERE ContactNo = @ContactNo
      `);

    // ✅ If exists → return existing user
    if (existing.recordset.length > 0) {
      return res.json({ UserID: existing.recordset[0].UserID });
    }

    // 2️⃣ Create new User
    const newUser = await pool.request()
      .query(`
        INSERT INTO [User] (UserType, Status, CreatedBy, CreatedDt)
        OUTPUT INSERTED.UserID
        VALUES (2, 1, 1, GETDATE())
      `);

    const newUserId = newUser.recordset[0].UserID;

    // 3️⃣ Insert passenger info (FULL DETAILS)
    await pool.request()
      .input("UserID", sql.Int, newUserId)
      .input("FirstName", sql.VarChar, FirstName)
      .input("MiddleName", sql.VarChar, MiddleName)
      .input("LastName", sql.VarChar, LastName)
      .input("Email", sql.VarChar, Email)
      .input("ContactNo", sql.VarChar, ContactNo)
      .input("Gender", sql.VarChar, Gender)
      .input("Age", sql.Int, Age)
      .input("AadharNo", sql.VarChar, AadharNo)
      .input("PancardNo", sql.VarChar, PancardNo)
      .input("BloodGroup", sql.VarChar, BloodGroup)
      .input("DOB", sql.Date, DOB)
      .input("FoodPref", sql.VarChar, FoodPref)
      .input("Disabled", sql.Bit, Disabled)
      .input("DrivingLicence", sql.VarChar, DrivingLicence)
      .input("PassportNo", sql.VarChar, PassportNo)
      .input("RationCard", sql.VarChar, RationCard)
      .input("VoterID", sql.VarChar, VoterID)
      .input("Others", sql.VarChar, Others)
      .input("NRI", sql.Bit, NRI)
      .input("CreatedBy", sql.Int, newUserId)
      .query(`
        INSERT INTO SavedPassengerDtls 
        (UserID, FirstName, MiddleName, LastName, Email, ContactNo, Gender, Age, 
         AadharNo, PancardNo, BloodGroup, DOB, FoodPref, Disabled, DrivingLicence, 
         PassportNo, RationCard, VoterID, Others, NRI, PrimaryUser, CreatedBy, CreatedDt)
        VALUES 
        (@UserID, @FirstName, @MiddleName, @LastName, @Email, @ContactNo, @Gender, @Age,
         @AadharNo, @PancardNo, @BloodGroup, @DOB, @FoodPref, @Disabled, @DrivingLicence,
         @PassportNo, @RationCard, @VoterID, @Others, @NRI, 1, @CreatedBy, GETDATE())
      `);

    return res.json({ UserID: newUserId });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});


app.get("/api/package-list", (req, res) => {
  const packages = [
    { PackageID: "1", PackageName: "Tirupati 1 Night / 1 Days Dharma Darshan Package" },
    { PackageID: "2", PackageName: "Divine Blessings & Sacred Serenity – Tirupati & Srikalahasti in 2 Days 2 Nights" }
  ];
  res.json(packages);
});
// Hard-coded transporter for tirupatipackagetours.com email
const transporter = nodemailer.createTransport({
  host: "smtpout.secureserver.net", // GoDaddy SMTP
  port: 587,
  secure: false, // SSL
  requireTLS: true,
  auth: {
    user: "enquiry@tirupatipackagetours.com", // your domain email
    pass: "Nagesh@1987",                     // actual email password
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

// Optional: Verify SMTP connection on startup
transporter.verify((err, success) => {
  if (err) {
    console.error("SMTP connection failed:", err);
  } else {
    console.log("✅ SMTP server is ready to send emails");
  }
});

// Contact form API endpoint
app.post("/api/submit-feedback", async (req, res) => {
  const { name, emailId, contactNo, userFeedback, packageId } = req.body;

  // Validate fields
  if (!name || !emailId || !contactNo || !userFeedback || !packageId) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  const mailOptions = {
    from: `"Website Contact" <enquiry@tirupatipackagetours.com>`, // must match SMTP user
    to: "enquiry@tirupatipackagetours.com",                        // where to receive emails
    subject: `New Contact Form Submission - Package ID: ${packageId}`,
    html: `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${emailId}</p>
      <p><strong>Phone:</strong> ${contactNo}</p>
      <p><strong>Package ID:</strong> ${packageId}</p>
      <p><strong>Feedback:</strong><br/>${userFeedback}</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "Feedback submitted successfully" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send email",
      error: error.response || error.toString(),
    });
  }
});

// app.post("/api/send-ticket", async (req, res) => {
//   try {
//     const { travellerData, contactData, gstData, totalPrice, tripData } = req.body;

//     const passenger = travellerData?.[0] || {};

//     const mailOptions = {
//       from: `"Tirupati Package Tours" <enquiry@tirupatipackagetours.com>`,
//       to: contactData?.email || "enquiry@tirupatipackagetours.com",
//       subject: "Your Tirupati Package Booking Ticket",
//       html: `
//         <h2>Booking Confirmation</h2>

//         <h3>Passenger Details</h3>
//         <p><strong>Name:</strong> ${passenger.name || ""}</p>
//         <p><strong>Age:</strong> ${passenger.age || ""}</p>
//         <p><strong>Gender:</strong> ${passenger.gender || ""}</p>

//         <h3>Contact Details</h3>
//         <p><strong>Name:</strong> ${contactData?.name || ""}</p>
//         <p><strong>Email:</strong> ${contactData?.email || ""}</p>
//         <p><strong>Phone:</strong> ${contactData?.phone || ""}</p>

//         <h3>Trip Details</h3>
//         <p><strong>Package:</strong> ${tripData?.packageName || ""}</p>
//         <p><strong>Journey Date:</strong> ${tripData?.date || ""}</p>

//         <h3>Payment</h3>
//         <p><strong>Total Amount:</strong> ₹${totalPrice}</p>

//         <br/>
//         <p>Thank you for booking with <b>Tirupati Package Tours</b>.</p>
//       `,
//     };

//     await transporter.sendMail(mailOptions);

//     res.json({
//       success: true,
//       message: "Ticket email sent successfully",
//     });

//   } catch (error) {
//     console.error("Ticket email error:", error);

//     res.status(500).json({
//       success: false,
//       message: "Failed to send ticket email",
//       error: error.toString(),
//     });
//   }
// });


app.post("/api/send-ticket", async (req, res) => {
  try {
    const { travellerData, contactData, totalPrice, tripData } = req.body;

    const passenger = travellerData?.[0] || {};
    const email = contactData?.Email || contactData?.email;

    const mailOptions = {
      from: `"Tirupati Package Tours" <enquiry@tirupatipackagetours.com>`,
      to: email,
      subject: "Tirupati Package Booking Ticket",
      html: `
        <h2>Booking Confirmation</h2>

        <h3>Passenger Details</h3>
        <p><strong>Name:</strong> ${passenger.FirstName}</p>
        <p><strong>Age:</strong> ${passenger.Age}</p>
        <p><strong>Gender:</strong> ${passenger.Gender}</p>

        <h3>Contact Details</h3>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${contactData?.ContactNo}</p>

        <h3>Total Price</h3>
        <p>₹${totalPrice}</p>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: "Ticket email sent successfully"
    });

  } catch (error) {
    console.error("Email error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to send email"
    });
  }
});

app.get("/api/get-booking-by-phone", async (req, res) => {
  const { phone, date } = req.query;

  if (!phone) {
    return res.status(400).json({ success: false, error: "phone is required" });
  }

  try {
    const pool = await sql.connect(dbConfig);

    // ── Step 1: Get the booking ──
    const bookingResult = await pool.request()
      .input("ContactNo", sql.VarChar(50), phone)
      .input("JourneyDate", sql.Date, date || null)
      .query(`
        SELECT TOP 1
          bbs.BusBookingSeatID,
          bbs.BusBookingDetailsID,
          bbs.FirstName,
          bbs.LastName,
          bbs.SeatNo,
          bbs.TicketNo,
          bbs.JourneyDate,
          bbs.Email,
          bbs.ContactNo,
          bbs.Gender,
          bbd.DepartureTime,
          bbd.Arrivaltime,
          bbd.BusBooKingDetailID AS busId,
          bo.BusNo,
          bo.BusType,
          p.PackageName,
          p.PackageID,
          spd.Age
        FROM BusBookingSeat bbs
        LEFT JOIN BusBookingDetails bbd ON bbs.BusBookingDetailsID = bbd.BusBooKingDetailID
        LEFT JOIN BusOperator bo ON bbd.OperatorID = bo.BusOperatorID
        LEFT JOIN Package p ON bbd.PackageID = p.PackageID
        LEFT JOIN SavedPassengerDtls spd 
          ON bbs.UserID = spd.UserID AND bbs.FirstName = spd.FirstName
        WHERE bbs.ContactNo = @ContactNo
          AND bbs.Status = 'Booked'
          AND (
            (@JourneyDate IS NULL AND CAST(bbs.JourneyDate AS DATE) >= CAST(GETDATE() AS DATE))
            OR
            (@JourneyDate IS NOT NULL AND CAST(bbs.JourneyDate AS DATE) = @JourneyDate)
          )
        ORDER BY bbs.JourneyDate ASC
      `);

    if (!bookingResult.recordset.length) {
      return res.json({ booking: null });
    }

    const first = bookingResult.recordset[0];

    // ── Step 2: Get all seats for this booking ──
    const allSeatsResult = await pool.request()
      .input("BusBookingDetailsID", sql.Int, first.BusBookingDetailsID)
      .input("ContactNo", sql.VarChar(50), phone)
      .input("JourneyDate", sql.Date, first.JourneyDate)
      .query(`
        SELECT 
          bbs.FirstName,
          bbs.LastName,
          bbs.SeatNo,
          bbs.TicketNo,
          bbs.Gender,
          spd.Age
        FROM BusBookingSeat bbs
        LEFT JOIN SavedPassengerDtls spd 
          ON bbs.UserID = spd.UserID AND bbs.FirstName = spd.FirstName
        WHERE bbs.BusBookingDetailsID = @BusBookingDetailsID
          AND bbs.ContactNo = @ContactNo
          AND CAST(bbs.JourneyDate AS DATE) = CAST(@JourneyDate AS DATE)
          AND bbs.Status = 'Booked'
      `);

    // ── Step 3: Get boarding and dropping points ──
    const pointsResult = await pool.request()
      .input("DetailID", sql.Int, first.busId)
      .query(`
        SELECT 
          LTRIM(RTRIM(PointType)) AS PointType,
          PointName,
          AreaName AS Landmark,
          AreaName AS Address,
          '' AS ContactNo,
          CONVERT(varchar, [Time], 108) AS ReportingTime
        FROM vw_BusBoardingAndDroppingPoints
        WHERE BusBooKingDetailID = @DetailID
      `);

    const points = pointsResult.recordset;
    const boardingPoint = points.find(p => p.PointType === 'B') || {};
    const droppingPoint = points.find(p => p.PointType === 'D') || {};

    // ── Step 4: Get total price from Payment table ──
    const paymentResult = await pool.request()
      .input("BookingdtlsID", sql.Int, first.BusBookingDetailsID)
      .query(`
        SELECT TOP 1 Amount 
        FROM Payment 
        WHERE BookingdtlsID = @BookingdtlsID
          AND PaymentStatus = 'Success'
        ORDER BY CreatedDt DESC
      `);

    const totalPrice = paymentResult.recordset[0]?.Amount || 0;

    // ── Step 5: Shape response to match MeeraChat BookingData type ──
    res.json({
      booking: {
        travellerData: allSeatsResult.recordset.map(r => ({
          FirstName: r.FirstName || "",
          LastName: r.LastName || "",
          Age: String(r.Age || ""),
          Gender: r.Gender || "",
          SeatNo: r.SeatNo || "",
        })),
        contactData: {
          ContactNo: first.ContactNo || "",
          Email: first.Email || "",
        },
        gstData: {},
        totalPrice: totalPrice,
        packageId: String(first.PackageID || ""),
        from: boardingPoint.PointName || "Bengaluru",
        tickets: [{ TicketNo: first.TicketNo || "N/A" }],
        tripData: {
          boardingPoint: {
            City: "Bengaluru",
            PointName: boardingPoint.PointName || "",
            Landmark: boardingPoint.Landmark || "",
            Address: boardingPoint.Address || "",
            ContactNo: boardingPoint.ContactNo || "",
          },
          droppingPoint: {
            City: "Tirupati",
            PointName: droppingPoint.PointName || "",
            Landmark: droppingPoint.Landmark || "",
            Address: droppingPoint.Address || "",
            ContactNo: droppingPoint.ContactNo || "",
          },
          travelDate: first.JourneyDate
            ? new Date(first.JourneyDate).toISOString().split("T")[0]
            : "",
          departureTime: first.DepartureTime
            ? moment(first.DepartureTime).format("hh:mm A")
            : "",
          arrivalTime: first.Arrivaltime
            ? moment(first.Arrivaltime).format("hh:mm A")
            : "",
          busType: first.BusType || "",
          coachType: first.BusType || "",
          busNumber: first.BusNo || "",
          operator: "SANCHAR6T",
          selectedSeats: allSeatsResult.recordset.map(r => r.SeatNo),
        },
      },
    });

  } catch (err) {
    console.error("❌ get-booking-by-phone error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/busBoardingCounts", async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request().query(`
      SELECT 
          bo.BusOperatorID,
          COUNT(bbp.BusBoardingPointID) AS NumBoardingPoints
      FROM BusOperator bo
      LEFT JOIN BusBookingSeat bbs 
          ON bbs.BusOperatorID = bo.BusOperatorID
      LEFT JOIN BusBoardingPoint bbp
          ON bbp.BusBooKingDetailID = bbs.BusBookingDetailsID
      GROUP BY bo.BusOperatorID;
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error", details: err.message });
  } finally {
    sql.close();
  }
});

/////// phone pe payment ///////////

// app.post("/api/success", async (req, res) => {
//   try {
//     const {
//       UserID,
//       BusBookingSeatID,
//       BookingdtlsID,
//       Amount,
//       PaymentMode,
//       TransactionID,
//       TransactionResponse,
//       TransactionCode,
//       PaymentStatus,
//       ErrorCode,
//       CreatedBy,
//       orderId,
//       transactionId,
//       status,
//       code,
//       JourneyDate, // 👈 Optional, pass from frontend/callback
//     } = req.body;

//     // 🧩 Normalize incoming values
//     const normalizedAmount = parseInt(Amount || req.body.amount || 0);
//     const normalizedTxnId = TransactionID || transactionId || orderId || null;
//     const normalizedStatus = PaymentStatus || status || "Success";
//     const normalizedCode = TransactionCode || code || "00";
//     const normalizedResponse =
//       TransactionResponse || JSON.stringify(req.body);
//     const normalizedJourneyDate =
//       JourneyDate || new Date().toISOString().split("T")[0];

//     // ⚠️ Validate essential fields
//     if (!normalizedTxnId || !normalizedAmount) {
//       return res.status(400).json({
//         success: false,
//         message: "Amount and TransactionID are required",
//       });
//     }

//     const pool = await sql.connect(dbConfig);

//     // ✅ 1️⃣ Record the payment in your table
//     const request = pool.request();
//     request.input("Flag", sql.Char(1), "I");
//     request.input("PaymentID", sql.Int, 0);
//     request.input("UserID", sql.Int, UserID ?? null);
//     request.input("BookingdtlsID", sql.Int, BookingdtlsID ?? null);

//     const parsedBusBookingSeatId =
//       BusBookingSeatID && BusBookingSeatID !== "undefined"
//         ? parseInt(BusBookingSeatID)
//         : null;
//     request.input("BusBookingSeatID", sql.Int, parsedBusBookingSeatId);

//     request.input("Amount", sql.Int, normalizedAmount);
//     request.input("PaymentMode", sql.VarChar(50), PaymentMode ?? "PhonePe");
//     request.input("TransactionID", sql.VarChar(sql.MAX), normalizedTxnId);
//     request.input("TransactionResponse", sql.VarChar(sql.MAX), normalizedResponse);
//     request.input("TransactionCode", sql.VarChar(50), normalizedCode);
//     request.input("PaymentStatus", sql.VarChar(50), normalizedStatus);
//     request.input("ErrorCode", sql.VarChar(500), ErrorCode ?? null);
//     request.input("CreatedBy", sql.Int, CreatedBy ?? UserID ?? 1);

//     await request.execute("dbo.sp_Payment");

//     console.log("✅ Payment recorded successfully:", normalizedTxnId);

//     const updateSeat = pool.request();
// updateSeat.input("BusBookingSeatID", sql.Int, parsedBusBookingSeatId);
// updateSeat.input("BookingdtlsID", sql.Int, BookingdtlsID);
// updateSeat.input("JourneyDate", sql.Date, normalizedJourneyDate);

// // 🧩 If JourneyDate is NULL, update without it
// await updateSeat.query(`
//   UPDATE BusBookingSeat
//   SET Status = 'Booked',
//       PaymentStatus = 'Success',
//       LockStatus ='Unlocked'

//   WHERE 
//     (BusBookingSeatID = @BusBookingSeatID OR BusBookingDetailsID = @BookingdtlsID)
//     ${normalizedJourneyDate ? "AND CAST(JourneyDate AS DATE) = @JourneyDate" : ""}
// `);


//     console.log("✅ Booking status updated successfully");

//     // ✅ 3️⃣ Delete corresponding SeatLock records
//     const cleanup = pool.request();
//     cleanup.input("BusBookingDetailsID", sql.Int, BookingdtlsID);
//     cleanup.input("JourneyDate", sql.Date, normalizedJourneyDate);

//     await cleanup.query(`
//       DELETE FROM SeatLock
//       WHERE BusBookingDetailsID = @BusBookingDetailsID
//         AND CAST(JourneyDate AS DATE) = @JourneyDate
//     `);

//     console.log("🧹 Seat locks cleaned up after successful payment");

//     // ✅ 4️⃣ Respond to frontend
//     res.status(201).json({
//       success: true,
//       message: "✅ Payment recorded, seat booked, and lock cleared successfully",
//     });
//   } catch (err) {
//     console.error("❌ Error saving payment:", err);
//     res.status(500).json({
//       success: false,
//       message: "Failed to record payment",
//       error: err.message,
//     });
//   }
// });

app.post("/api/success", async (req, res) => {
  try {
    const {
      UserID,
      BookingdtlsID,
      Amount,
      PaymentMode,
      TransactionID,
      TransactionResponse,
      TransactionCode,
      PaymentStatus,
      ErrorCode,
      CreatedBy,
      JourneyDate,
      BusBookingSeatIDs // ⭐ now array from callback
    } = req.body;

    // Convert seat IDs → Array<int>
    const seatIdArray = Array.isArray(BusBookingSeatIDs)
      ? BusBookingSeatIDs.map((id) => parseInt(id))
      : [];

    console.log("🎯 Seat IDs for ticket generation:", seatIdArray);

    // Normalize fields
    const normalizedAmount = parseInt(Amount || 0);
    const normalizedTxnId = TransactionID || null;
    const normalizedStatus = PaymentStatus || "Success";
    const normalizedCode = TransactionCode || "00";
    const normalizedResponse =
      TransactionResponse || JSON.stringify(req.body);
    const normalizedJourneyDate =
      JourneyDate || new Date().toISOString().split("T")[0];

    if (!normalizedTxnId || !normalizedAmount) {
      return res.status(400).json({
        success: false,
        message: "Amount and TransactionID are required",
      });
    }

    const pool = await sql.connect(dbConfig);



    // ------------------------------------------------------------------
    // 1️⃣ SAVE PAYMENT
    // ------------------------------------------------------------------
    const payReq = pool.request();
    payReq.input("Flag", sql.Char(1), "I");
    payReq.input("PaymentID", sql.Int, 0);
    payReq.input("UserID", sql.Int, UserID);
    payReq.input("BookingdtlsID", sql.Int, BookingdtlsID);

    payReq.input("BusBookingSeatID", sql.Int, seatIdArray[0]); // ✔ any one seat ID

    payReq.input("Amount", sql.Int, normalizedAmount);
    payReq.input("PaymentMode", sql.VarChar(50), PaymentMode || "PhonePe");
    payReq.input("TransactionID", sql.VarChar(sql.MAX), normalizedTxnId);
    payReq.input(
      "TransactionResponse",
      sql.VarChar(sql.MAX),
      normalizedResponse
    );
    payReq.input("TransactionCode", sql.VarChar(50), normalizedCode);
    payReq.input("PaymentStatus", sql.VarChar(50), normalizedStatus);
    payReq.input("ErrorCode", sql.VarChar(500), ErrorCode || null);
    payReq.input("CreatedBy", sql.Int, CreatedBy || UserID || 1);

    await payReq.execute("dbo.sp_Payment");

    console.log("💾 Payment saved successfully:", normalizedTxnId);

    /// ------------------------------------------------------
    // 2️⃣ Generate Tickets for multiple seat IDs
    // ------------------------------------------------------
    const ticketReq = pool.request();

    // regular inputs
    ticketReq.input("UserID", sql.Int, UserID);
    ticketReq.input("BookingdtlsID", sql.Int, BookingdtlsID);
    ticketReq.input("JourneyDate", sql.Date, normalizedJourneyDate);

    // ⭐ Create TVP for seat IDs
    const seatList = new sql.Table("dbo.IntList");
    seatList.columns.add("SeatID", sql.Int);

    seatIdArray.forEach((id) => seatList.rows.add(id));

    // ⭐ MUST specify sql.TVP
    ticketReq.input("SeatIDs", sql.TVP, seatList);

    const ticketRes = await ticketReq.execute("sp_GenerateTicketsAndUpdateBooking");

    console.log("🎫 Tickets generated:", ticketRes.recordset);

    return res.status(201).json({
      success: true,
      message: "Payment recorded and tickets generated successfully.",
      tickets: ticketRes.recordset,
    });
  } catch (err) {
    console.error("❌ Error in /api/success:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error during payment success.",
      error: err.message,
    });
  }
});


app.post("/api/payment/create-order", async (req, res) => {
  try {
    let { amount, busBookingSeatIds } = req.body;

    // ✅ VALIDATION
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    if (!Array.isArray(busBookingSeatIds) || busBookingSeatIds.length === 0) {
      return res.status(400).json({ error: "Seat IDs are required" });
    }

    console.log("🔥 Incoming amount:", amount);
    console.log("🔥 Seat IDs:", busBookingSeatIds);

    // ✅ SAFE merchantOrderId
    const merchantIdPrefix = `ORD_${busBookingSeatIds.join("_")}_`;
    const merchantOrderId = (merchantIdPrefix + Date.now()).substring(0, 35);

    // ✅ seatIds param for redirect
    const seatIdsParam = busBookingSeatIds.join(",");

    // ⚠️ VERY IMPORTANT: must be correct URL
    const BACKEND_URL =
      process.env.BACK_END_URL || "http://localhost:5000";

    const redirectUrl = `${BACKEND_URL}/payment/redirect?orderId=${merchantOrderId}&seatIds=${seatIdsParam}`;

    console.log("🔥 Redirect URL:", redirectUrl);

    // ✅ PhonePe Meta
    const metaInfo = MetaInfo.builder()
      .udf1("Sanchar6T")
      .build();

    // ✅ Payment request
    const paymentRequest = StandardCheckoutPayRequest.builder()
      .merchantOrderId(merchantOrderId)
      .amount(Number(amount)) // already in paisa
      .redirectUrl(redirectUrl)
      .metaInfo(metaInfo)
      .build();

    console.log("🔥 Sending request to PhonePe...");

    // ✅ CALL PhonePe
    const response = await client.pay(paymentRequest);

    console.log("🔥 PhonePe response:", response);

    if (!response?.redirectUrl) {
      throw new Error("No redirect URL from PhonePe");
    }

    // ✅ FINAL RESPONSE
    return res.json({
      success: true,
      phonepeResponse: {
        redirectUrl: response.redirectUrl,
      },
      merchantOrderId,
    });

  } catch (err) {
    console.error("❌ Payment Error:", err.message);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

app.get("/payment/redirect", async (req, res) => {
  const { orderId, seatIds } = req.query;

  const busBookingSeatIds = seatIds
    ? seatIds.split(",").map(Number)
    : [];


  if (!orderId || !busBookingSeatIds) return res.redirect(`${process.env.FRONT_END_URL}/payment-result?status=failed`);

  const pool = await sql.connect(dbConfig);
  // Polling function
  const checkPayment = async () => {
    try {
      const statusResponse = await client.getOrderStatus(orderId);
      return statusResponse.state; // "COMPLETED", "PENDING", "FAILED"
    } catch (err) {
      return "FAILED";
    }
  };

  let attempts = 0;
  const maxAttempts = 10; // adjust according to your patience window
  const interval = 3000; // 3 seconds
  const seatIdsStr = busBookingSeatIds.join(",");

  while (attempts < maxAttempts) {
    const state = await checkPayment();
    console.log("State:", state);

    if (state === "COMPLETED") {
      // 🚀 NEW: Call backend-driven finalization
      const statusResponse = await client.getOrderStatus(orderId);
      await finalizeBooking(orderId, statusResponse.amount / 100, busBookingSeatIds, statusResponse);

      return res.redirect(`${process.env.FRONT_END_URL}/payment-result?status=success&orderId=${orderId}`);
    } else if (state === "FAILED") {
      await pool.request().query(`
        UPDATE BusBookingSeat
        SET PaymentStatus = 'Failed', Status = 'Cancelled'
        WHERE BusBookingSeatID IN (${seatIdsStr})
      `);
      return res.redirect(`${process.env.FRONT_END_URL}/payment-result?status=failed&orderId=${orderId}`);
    }

    // still pending
    await new Promise((r) => setTimeout(r, interval));
    attempts++;
  }

  await pool.request().query(`
    UPDATE BusBookingSeat
    SET PaymentStatus = 'Failed', Status = 'Cancelled'
    WHERE BusBookingSeatID IN (${seatIdsStr})
  `);
  // If still pending after max attempts, consider it failed or show pending page
  return res.redirect(`${process.env.FRONT_END_URL}/payment-result?status=loading&orderId=${orderId}`);
});

async function finalizeBooking(orderId, amount, seatIds, statusResponse) {
  try {
    const pool = await sql.connect(dbConfig);

    // 1️⃣ Check if already finalized to avoid duplicates
    const check = await pool.request()
      .input("TransactionID", sql.VarChar, orderId)
      .query("SELECT TOP 1 PaymentStatus FROM Payment WHERE TransactionID = @TransactionID");

    if (check.recordset.length > 0 && check.recordset[0].PaymentStatus === "Success") {
      console.log(`ℹ️ Booking already finalized for OrderId: ${orderId}`);
      return { success: true, message: "Already finalized" };
    }

    // 2️⃣ Fetch status from PhonePe if not provided (e.g. called from a background sync or redirect without callback)
    if (!statusResponse) {
      statusResponse = await client.getOrderStatus(orderId);
    }

    if (statusResponse.state !== "COMPLETED") {
      console.log(`⚠️ Payment not successful for OrderId: ${orderId}. Status: ${statusResponse.state} (Code: ${statusResponse.code})`);
      return { success: false, message: "Payment failed" };
    }

    // 3️⃣ Fetch extra data (UserID, BookingdtlsID, JourneyDate, etc.) from DB
    const firstSeatId = seatIds[0];
    const seatInfo = await pool.request()
      .input("SeatID", sql.Int, firstSeatId)
      .query(`
        SELECT UserID, BusBookingDetailsID, BusOperatorID, JourneyDate, Email, ContactNo, FirstName, LastName
        FROM BusBookingSeat 
        WHERE BusBookingSeatID = @SeatID
      `);

    if (seatInfo.recordset.length === 0) {
      throw new Error(`Seat information not found for SeatID: ${firstSeatId}`);
    }

    const { UserID, BusBookingDetailsID, BusOperatorID, JourneyDate, Email, ContactNo, FirstName, LastName } = seatInfo.recordset[0];

    // 3️⃣ Record Payment
    const payReq = pool.request();
    payReq.input("Flag", sql.Char(1), "I");
    payReq.input("PaymentID", sql.Int, 0);
    payReq.input("UserID", sql.Int, UserID);
    payReq.input("BookingdtlsID", sql.Int, BusBookingDetailsID);
    payReq.input("BusBookingSeatID", sql.Int, firstSeatId);
    payReq.input("Amount", sql.Int, amount);
    payReq.input("PaymentMode", sql.VarChar(50), "PhonePe");
    payReq.input("TransactionID", sql.VarChar(sql.MAX), orderId);
    payReq.input("TransactionResponse", sql.VarChar(sql.MAX), JSON.stringify(statusResponse));
    payReq.input("TransactionCode", sql.VarChar(50), statusResponse.code || "00");
    payReq.input("PaymentStatus", sql.VarChar(50), "Success");
    payReq.input("CreatedBy", sql.Int, UserID || 1);

    await payReq.execute("dbo.sp_Payment");
    console.log("💾 Payment recorded for:", orderId);

    // 🆕 3.5️⃣ Reduce Seat Count in BusOperator
    try {
      console.log(`📉 Reducing ${seatIds.length} seat(s) for BusOperatorID: ${BusOperatorID}`);
      await pool.request()
        .input("BusOperatorID", sql.Int, BusOperatorID)
        .input("SeatCount", sql.Int, seatIds.length)
        .query(`
          UPDATE BusOperator 
          SET BusSeats = CASE WHEN (BusSeats - @SeatCount) < 0 THEN 0 ELSE (BusSeats - @SeatCount) END
          WHERE BusOperatorID = @BusOperatorID
        `);
      console.log("✅ Seat reduction successful");
    } catch (reduceErr) {
      console.error("⚠️ Seat reduction failed (non-critical):", reduceErr.message);
    }

    // 4️⃣ Generate Tickets
    const ticketReq = pool.request();
    ticketReq.input("UserID", sql.Int, UserID);
    ticketReq.input("BookingdtlsID", sql.Int, BusBookingDetailsID);
    // Use ISO string date part only to avoid time mismatch in sp_GenerateTicketsAndUpdateBooking
    const journeyDateStr = new Date(JourneyDate).toISOString().split('T')[0];
    console.log(`Using JourneyDate for ticket generation: ${journeyDateStr}`);
    ticketReq.input("JourneyDate", sql.Date, journeyDateStr);

    const seatTable = new sql.Table("dbo.IntList");
    seatTable.columns.add("SeatID", sql.Int);
    seatIds.forEach(id => seatTable.rows.add(Number(id)));
    ticketReq.input("SeatIDs", sql.TVP, seatTable);
    console.log(`Attempting to generate tickets for SeatIDs: ${seatIds.join(",")} with UserID: ${UserID}, BookingdtlsID: ${BusBookingDetailsID}, JourneyDate: ${journeyDateStr}`);

    const ticketRes = await ticketReq.execute("sp_GenerateTicketsAndUpdateBooking");
    console.log("🎫 Tickets generated. Result count:", ticketRes.recordset?.length);

    // 3️⃣ Fetch full details for the ticket
    const detailedInfo = await pool.request()
      .query(`
        SELECT 
            bbs.BusBookingSeatID, bbs.FirstName, bbs.LastName, bbs.SeatNo, bbs.TicketNo, 
            bbs.JourneyDate, bbs.Email, bbs.ContactNo,
            bbd.DepartureTime, bbd.Arrivaltime,
            bo.BusNo, bo.BusType,
            p.PackageName
        FROM BusBookingSeat bbs
        JOIN BusBookingDetails bbd ON bbs.BusBookingDetailsID = bbd.BusBooKingDetailID
        JOIN BusOperator bo ON bbd.OperatorID = bo.BusOperatorID
        JOIN Package p ON bbd.PackageID = p.PackageID
        WHERE bbs.BusBookingSeatID IN (${seatIds.join(",")})
      `);

    console.log(`📊 Detailed Info Result (${detailedInfo.recordset.length} rows):`, JSON.stringify(detailedInfo.recordset, null, 2));

    if (detailedInfo.recordset.length === 0) {
      throw new Error(`Failed to fetch detailed ticket info for seats: ${seatIds}`);
    }
    const http = require("http");
    const { WebSocketServer } = require("ws");
    const firstRow = detailedInfo.recordset[0];
    const journeyDate = new Date(firstRow.JourneyDate);

    const formatDateTime = (baseDate, time) => {
      if (!time) return null;

      const t = new Date(time);

      return new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate(),
        t.getHours(),
        t.getMinutes()
      );
    };

    let departureDT = formatDateTime(journeyDate, firstRow.DepartureTime);
    let arrivalDT = formatDateTime(journeyDate, firstRow.Arrivaltime);

    if (arrivalDT < departureDT) {
      arrivalDT.setDate(arrivalDT.getDate() + 1);
    }

    const departureStr = moment.utc(departureDT).local().format("DD MMM YYYY, hh:mm A");
    const arrivalStr = moment.utc(arrivalDT).local().format("DD MMM YYYY, hh:mm A"); const seatsList = detailedInfo.recordset.map(r => r.SeatNo || "N/A").join(", ");
    const passengersList = detailedInfo.recordset.map(r => `${r.FirstName} ${r.LastName || ""}`).join(", ");
    const ticketNo = firstRow.TicketNo || "PENDING";

    // 5️⃣ Send Confirmation Email
    try {
      const mailOptions = {
        from: `"Tirupati Package Tours" <enquiry@tirupatipackagetours.com>`,
        to: Email || firstRow.Email,
        subject: `E-Ticket Confirmed! - ${firstRow.PackageName}`,
        html: `
          <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #dcdcdc; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
            <!-- Header -->
            <div style="background-color: ; padding: 20px; text-align: center; border-bottom: 2px solid #f4c542;">
              <img src="https://tirupatipackagetours.com/tirupati-package-tours-logo.jpeg" alt="Logo" style="height: 80px; margin-bottom: 10px;">
              <h1 style="margin: 0; color: #333; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">E-Ticket Confirmation</h1>
              <p style="margin: 5px 0 0 0; color: #d60000; font-weight: bold;">Ticket No: ${ticketNo}</p>
            </div>

            <!-- Content -->
            <div style="padding: 25px;">
              <p style="font-size: 16px; line-height: 1.5; color: #333;">Hello <b>${firstRow.FirstName}</b>,</p>
              <p style="font-size: 16px; line-height: 1.5; color: #333;">Your spiritual journey is confirmed! Here are your booking details:</p>

              <!-- Trip Card -->
              <div style="background-color: #fff9e6; border: 1px solid #f4c542; border-radius: 6px; padding: 15px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #8a6d3b; border-bottom: 1px solid #f4c542; padding-bottom: 8px;">Trip Details</h3>
                <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 5px 0; color: #666;">Package:</td>
                    <td style="padding: 5px 0; font-weight: bold; color: #333;">${firstRow.PackageName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #666;">Date:</td>
                    <td style="padding: 5px 0; font-weight: bold; color: #333;">${new Date(firstRow.JourneyDate).toDateString()}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #666;">Bus:</td>
                    <td style="padding: 5px 0; font-weight: bold; color: #333;">${firstRow.BusNo} (${firstRow.BusType})</td>
                  </tr>
                 <tr>
  <td style="padding: 5px 0; color: #666;">Timings:</td>
  <td style="padding: 5px 0; font-weight: bold; color: #333;">
    ${departureStr} to ${arrivalStr}
  </td>
</tr>
                </table>
              </div>

              <!-- Passenger Card -->
              <div style="background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 6px; padding: 15px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #333; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px;">Passenger & Seats</h3>
                <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 5px 0; color: #666;">Passengers:</td>
                    <td style="padding: 5px 0; font-weight: bold; color: #333;">${passengersList}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #666;">Seat(s):</td>
                    <td style="padding: 5px 0; font-weight: bold; color: #333;">${seatsList}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #666;">Total Paid:</td>
                    <td style="padding: 5px 0; font-weight: bold; color: #22c55e; font-size: 18px;">₹${amount}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #666;">Transaction ID:</td>
                    <td style="padding: 5px 0; font-size: 12px; color: #999;">${orderId}</td>
                  </tr>
                </table>
              </div>

              <div style="text-align: center; margin-top: 30px;">
                <p style="color: #666; font-size: 14px;">Please carry a valid ID proof during travel. Reach the boarding point 15 mins early.</p>
                <p style="margin-top: 20px; font-weight: bold; color: #333;">Thank you for choosing Tirupati Package Tours!</p>
              </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #333; color: #ffffff; padding: 15px; text-align: center; font-size: 12px;">
              <p style="margin: 0;">&copy; 2025 Tirupati Package Tours. All rights reserved.</p>
              <p style="margin: 5px 0 0 0;">Contact us: enquiry@tirupatipackagetours.com | +91 9876543210</p>
            </div>
          </div>
        `
      };
      await transporter.sendMail(mailOptions);
      console.log("📧 Rich confirmation email sent to:", Email || firstRow.Email);
    } catch (mailErr) {
      console.error("⚠️ Email sending failed:", mailErr.message);
    }

    return { success: true };

  } catch (err) {
    console.error("❌ finalizeBooking Error:", err.message);
    throw err;
  }
}

app.all('/exotel/voice', (req, res) => {
  const wsUrl = `wss://${req.headers.host}/media-stream`;

  res.set('Content-Type', 'text/xml');
  res.send(`
    <Response>
      <Connect>
        <Stream url="${wsUrl}" />
      </Connect>
    </Response>
  `);
});

app.post("/api/payment/finalize", async (req, res) => {
  try {
    const { orderId, bookingData } = req.body;
    const statusResponse = await client.getOrderStatus(orderId);

    if (statusResponse.state !== "COMPLETED") {
      return res.json({ success: false, message: "Payment is not completed" });
    }

    const seatIds = bookingData?.seatIds || bookingData?.BusBookingSeatIDs || [];
    await finalizeBooking(orderId, bookingData?.totalPrice || (statusResponse.amount / 100), seatIds, statusResponse);

    return res.json({ success: true });
  } catch (err) {
    console.error("Payment finalize error:", err);
    return res.json({ success: false });
  }
});

// PhonePe POST Callback (Webhook)
// User must configure this URL in the PhonePe Dashboard: 
// https://api.tirupatipackagetours.com/api/payment/callback-phonepe
app.post("/api/payment/callback-phonepe", async (req, res) => {
  try {
    const authorization = req.headers['authorization'];
    const responseBody = JSON.stringify(req.body);

    // Credentials should be in .env
    const username = process.env.PHONEPE_CALLBACK_USERNAME;
    const password = process.env.PHONEPE_CALLBACK_PASSWORD;

    let orderId;
    let state;

    if (username && password && authorization) {
      try {
        const callbackResponse = client.validateCallback(username, password, authorization, responseBody);
        orderId = callbackResponse.payload.orderId;
        state = callbackResponse.payload.state;
      } catch (valErr) {
        console.error("❌ Callback Validation Failed:", valErr.message);
        return res.status(401).send("Invalid Callback");
      }
    } else {
      // Fallback if credentials not set (less secure but useful for testing)
      console.log("⚠️ No PhonePe callback credentials found, processing without validation.");
      // The body might be base64 encoded or plain depending on version
      const payload = req.body.response ? JSON.parse(Buffer.from(req.body.response, 'base64').toString()) : req.body;
      orderId = payload.data?.merchantOrderId || payload.merchantOrderId;
      state = payload.data?.state || payload.state;
    }

    if (orderId && (state === "COMPLETED" || state === "SUCCESS")) {
      // 🚀 Recover seatIds from the encoded merchantOrderId
      const parts = orderId.split("_");
      let seatIds = [];
      if (parts.length >= 3) {
        seatIds = parts.slice(1, -1).map(id => parseInt(id));
      }

      if (seatIds.length > 0) {
        const statusResponse = await client.getOrderStatus(orderId);
        if (statusResponse.state === "COMPLETED") {
          await finalizeBooking(orderId, statusResponse.amount / 100, seatIds, statusResponse);
        }
      }
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Callback Handler Error:", err.message);
    return res.status(500).send("Error");
  }
});


function generateStatusXVerify(apiPath) {
  const stringToHash = apiPath + SALT_KEY;
  const sha256 = crypto.createHash("sha256").update(stringToHash).digest("hex");
  return `${sha256}###${SALT_INDEX}`;
}




// Get enriched booking/ticket details by orderId (for frontend display)
app.get("/api/booking/details/:orderId", async (req, res) => {
  const { orderId } = req.params;
  try {
    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input("OrderId", sql.VarChar, orderId)
      .query(`
        SELECT 
            bbs.BusBookingSeatID, bbs.FirstName, bbs.LastName, bbs.SeatNo, bbs.TicketNo, 
            bbs.JourneyDate, bbs.Email, bbs.ContactNo, bbs.Gender,
            spd.Age as Age,
            bbd.DepartureTime, bbd.Arrivaltime, bbd.BusBooKingDetailID as busId,
            bo.BusNo, bo.BusType, bo.BusOperatorID,
            p.PackageName, p.PackageID as packageId,
            pay.Amount, pay.TransactionID, pay.PaymentStatus, pay.CreatedDt as BookedOn
        FROM Payment pay
        JOIN BusBookingSeat bbs ON pay.BusBookingSeatID = bbs.BusBookingSeatID OR pay.TransactionID = bbs.TicketNo
        LEFT JOIN BusBookingDetails bbd ON bbs.BusBookingDetailsID = bbd.BusBooKingDetailID
        LEFT JOIN BusOperator bo ON bbd.OperatorID = bo.BusOperatorID
        LEFT JOIN Package p ON bbd.PackageID = p.PackageID
        LEFT JOIN SavedPassengerDtls spd ON bbs.UserID = spd.UserID AND bbs.FirstName = spd.FirstName
        WHERE pay.TransactionID = @OrderId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const first = result.recordset[0];
    const busBookingDetailId = first.busId;


    const pointsResult = await pool.request()
      .input("DetailID", sql.Int, busBookingDetailId)
      .query(`
        SELECT PointName, AreaName as Landmark, AreaName as Address, '' as ContactNo, 
               [Time] as ReportingTime, PointType as Type
        FROM vw_BusBoardingAndDroppingPoints
        WHERE BusBooKingDetailID = @DetailID
      `);

    const points = pointsResult.recordset;
    const boardingPoint = points.find(p => p.Type && p.Type.trim() === 'B') || {};
    const droppingPoint = points.find(p => p.Type && p.Type.trim() === 'D') || {};

    const travellerData = result.recordset.map(r => ({
      FirstName: r.FirstName,
      LastName: r.LastName,
      Age: r.Age || 0,
      Gender: r.Gender,
      SeatNo: r.SeatNo,
      TicketNo: r.TicketNo
    }));

    const ticketData = {
      travellerData,
      contactData: {
        ContactNo: first.ContactNo,
        Email: first.Email
      },
      gstData: {},
      totalPrice: first.Amount,
      packageId: first.packageId,
      TicketNo: first.TicketNo,
      BookedOn: first.BookedOn ? moment(first.BookedOn).format("DD MMM YYYY") : "N/A",
      tripData: {
        boardingPoint: {
          PointName: boardingPoint.PointName || "N/A",
          Landmark: boardingPoint.Landmark || "N/A",
          Address: boardingPoint.Address || "N/A",
          ContactNo: boardingPoint.ContactNo || "N/A",
          Time: boardingPoint.ReportingTime || "N/A",
          City: "Bengaluru"
        },
        droppingPoint: {
          PointName: droppingPoint.PointName || "N/A",
          Landmark: droppingPoint.Landmark || "N/A",
          Address: droppingPoint.Address || "N/A",
          ContactNo: droppingPoint.ContactNo || "N/A",
          Time: droppingPoint.ReportingTime || "N/A"
        },
        travelDate: first.JourneyDate ? moment(first.JourneyDate).format("DD MMM YYYY") : "N/A",
        departureTime: first.DepartureTime ? moment(first.DepartureTime).format("hh:mm A") : "N/A",
        arrivalTime: first.Arrivaltime ? moment(first.Arrivaltime).format("hh:mm A") : "N/A",
        busType: first.BusType,
        selectedSeats: travellerData.map(p => p.SeatNo),
        operator: first.OperatorName || "SANCHAR6T",
        busNumber: first.BusNo,
        coachNumber: first.BusNo,
        numPassengers: result.recordset.length,
        reportingTime: boardingPoint.ReportingTime || "N/A"
      }
    };

    res.json({ success: true, tickets: result.recordset, ticketData });
  } catch (err) {
    console.error("❌ Error fetching booking details:", err);
    res.status(500).json({ success: false, message: "Error fetching booking details" });
  }
});

// 🧪 TEMPORARY TEST ENDPOINT (Delete after verification)
app.get("/api/test/force-success", async (req, res) => {
  const { orderId, seatIds } = req.query;
  const busBookingSeatIds = seatIds.split(",").map(Number);
  try {
    await finalizeBooking(orderId, busBookingSeatIds);
    return res.redirect(`${process.env.FRONT_END_URL}/payment-result?status=success&orderId=${orderId}`);
  } catch (err) {
    console.error("Test Error:", err);
    return res.redirect(`${process.env.FRONT_END_URL}/payment-failed`);
  }
});

app.post("/api/payment/callback", async (req, res) => {
  try {
    const { merchantTransactionId } = req.body.data;

    const apiPath = `/pg/v1/status/${MERCHANT_ID}/${merchantTransactionId}`;
    const xVerify = generateStatusXVerify(apiPath);

    const status = await axios.get(
      PHONEPE_BASE + apiPath,
      { headers: { "X-VERIFY": xVerify, "X-MERCHANT-ID": MERCHANT_ID } }
    );

    if (status.data?.data?.state !== "SUCCESS") {
      // return res.redirect(`${process.env.FRONT_END_URL}/payment-failed`);
      return res.redirect(`${process.env.FRONT_END_URL}/payment-failed`);
    }

    //return res.redirect(`${process.env.FRONT_END_URL}/payment-success`);
    return res.redirect(`${process.env.FRONT_END_URL}/payment-success`);


  } catch (err) {
    console.error("Callback Error:", err.response?.data || err);
    //  return res.redirect(`${process.env.FRONT_END_URL}/payment-failed`);
    return res.redirect(`${process.env.FRONT_END_URL}/payment-failed`);
  }
});

app.get("/api/bus/boardingPoints/:busId", async (req, res) => {
  const { busId } = req.params;
  console.log("🔍 Fetching boarding points for busId =", busId);
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input("busId", sql.Int, parseInt(busId))
      .query(`
        SELECT 
          PointType,
          BusBooKingDetailID,
          PointName,
          AreaName,
          Pincode,
          latitude,
          longitude,
          CONVERT(varchar, [Time], 108) AS [Time]
        FROM vw_BusBoardingAndDroppingPoints
        WHERE BusBooKingDetailID = @busId
          AND LTRIM(RTRIM(PointType)) = 'B'
        ORDER BY Time ASC
      `);
    res.json({
      success: true,
      count: result.recordset.length,
      boardingPoints: result.recordset,
    });
  } catch (err) {
    console.error("❌ Error fetching boarding points:", err);
    res.status(500).json({ success: false, message: "Error fetching boarding points" });
  }
});

app.get("/api/bus/droppingPoints/:busId", async (req, res) => {
  const { busId } = req.params;
  console.log("🔍 Fetching dropping points for busId =", busId);
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input("busId", sql.Int, parseInt(busId))
      .query(`
        SELECT 
          PointType,
          BusBooKingDetailID,
          PointName,
          AreaName,
          Pincode,
          latitude,
          longitude,
          CONVERT(varchar, [Time], 108) AS [Time]
        FROM vw_BusBoardingAndDroppingPoints
        WHERE BusBooKingDetailID = @busId
          AND LTRIM(RTRIM(PointType)) = 'D'
        ORDER BY Time ASC
      `);
    res.json({
      success: true,
      count: result.recordset.length,
      droppingPoints: result.recordset,
    });
  } catch (err) {
    console.error("❌ Error fetching dropping points:", err);
    res.status(500).json({ success: false, message: "Error fetching dropping points" });
  }
});


app.post("/api/admin/blockSeats", async (req, res) => {
  const { busBookingDetailId, seats, journeyDate, durationMinutes } = req.body;

  if (!busBookingDetailId || !seats || !journeyDate) {
    return res.status(400).json({
      success: false,
      message: "busBookingDetailId, seats & journeyDate are required",
    });
  }

  try {
    const pool = await sql.connect(dbConfig);

    await pool.request()
      .input("BusBookingDetailId", sql.Int, busBookingDetailId)
      .input("JourneyDate", sql.Date, journeyDate)
      .input("Seats", sql.VarChar, seats)
      .input("DurationMinutes", sql.Int, durationMinutes || null)
      .execute("sp_BlockSeatsForJourney");

    res.json({ success: true, message: "Seats blocked successfully" });

  } catch (error) {
    console.error("❌ Error blocking seats:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});


app.post("/api/admin/releaseSeats", async (req, res) => {
  const { busBookingDetailId, seats, journeyDate } = req.body;

  if (!busBookingDetailId || !seats || !journeyDate) {
    return res.status(400).json({
      success: false,
      message: "busBookingDetailId, seats & journeyDate are required",
    });
  }

  try {
    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input("BusBookingDetailId", sql.Int, busBookingDetailId)
      .input("JourneyDate", sql.Date, journeyDate)
      .input("SeatsToRelease", sql.VarChar, seats)
      .execute("sp_ReleaseBlockedSeats");

    res.json({ success: true, message: result.recordset[0].Message });

  } catch (error) {
    console.error("❌ Error releasing seats:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});



app.post("/api/admin/clearAllBlockedSeats", async (req, res) => {
  const { busBookingDetailId, journeyDate } = req.body;

  if (!busBookingDetailId || !journeyDate) {
    return res.status(400).json({
      success: false,
      message: "busBookingDetailId & journeyDate are required",
    });
  }

  try {
    const pool = await sql.connect(dbConfig);

    const result = await pool.request()
      .input("BusBookingDetailId", sql.Int, busBookingDetailId)
      .input("JourneyDate", sql.Date, journeyDate)
      .execute("sp_ClearAllBlockedSeats");

    res.json({ success: true, message: result.recordset[0].Message });

  } catch (error) {
    console.error("❌ Error clearing blocks:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});



// ---------------------------------------------------
// AUTO CLEANUP OF EXPIRED BLOCKS RUNS EVERY ONE HOUR
// ---------------------------------------------------

setInterval(async () => {
  try {
    const pool = await sql.connect(dbConfig);

    await pool.query(`
      UPDATE BusOperator
      SET BlockedSeats = NULL,
          BlockExpiresAt = NULL
      WHERE BlockExpiresAt IS NOT NULL
        AND BlockExpiresAt < GETDATE()
    `);

    console.log("⏳ Auto cleanup of expired blocks completed");
  } catch (err) {
    console.error("❌ Auto block cleanup failed:", err);
  }
}, 60 * 60 * 1000);


// ---------------------------------------------------
// 🧹 AUTO-CLEANUP JOB FOR EXPIRED SEAT LOCKS RUNS EVERY 10 MINUTES
// ---------------------------------------------------
const CLEANUP_INTERVAL_MINUTES = 11; // runs every 5 minutes

setInterval(async () => {
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.query(`
      DELETE FROM SeatLock
      WHERE ExpiresAt < GETDATE();
    `);

    if (result.rowsAffected[0] > 0) {
      console.log(`🧹 Cleaned ${result.rowsAffected[0]} expired seat locks`);
    }
  } catch (err) {
    console.error("❌ Seat lock cleanup error:", err.message);
  }
}, CLEANUP_INTERVAL_MINUTES * 60 * 1000);

// ---------------------------------------------------
// 🧹 AUTO-CLEANUP JOB TO mark old “Pending” seats as “Failed” if not paid within 15 min
// ---------------------------------------------------
setInterval(async () => {
  try {
    const pool = await sql.connect(dbConfig);
    await pool.query(`
      UPDATE BusBookingSeat
      SET Status = 'Cancelled', PaymentStatus = 'Failed'
      WHERE PaymentStatus = 'Pending' AND DATEDIFF(MINUTE, CreatedDt, GETDATE()) > 15;
    `);
  } catch (err) {
    console.error("Payment cleanup error:", err.message);
  }
}, 10 * 60 * 1000);

// ---------------------------------------------------
// 🧹 AUTO-CLEANUP JOB TO move the data from busbookingseat table to Archieve Bus Booking seat table
// ---------------------------------------------------

const ARCHIVE_INTERVAL_HOURS = 24;

setInterval(async () => {
  console.log("🕐 Running archive stored procedure:", new Date().toISOString());

  try {
    const pool = await sql.connect(dbConfig);

    // Execute the stored procedure in SQL Server
    await pool.request().execute("sp_ArchiveOldBusBookingSeats");

    console.log("Archive stored procedure executed successfully!");
  } catch (err) {
    console.error("Archive stored procedure failed:", err.message);
  } finally {
    // 🧹 Always close the SQL connection (only if you're not using a global pool)
    await sql.close();
  }
}, ARCHIVE_INTERVAL_HOURS * 60 * 60 * 1000); // every 6 hours

// ── LOAD FAISS SEARCH ENGINE AT STARTUP ──
initSearchEngine().catch(console.error);

// ✅ Start the server
// app.listen(PORT, "0.0.0.0", () => {
//   console.log(`🚀 Server running at http://localhost:${PORT}`);
// });

const http = require("http");
const { WebSocketServer } = require("ws");

// HTTP server
const server = http.createServer(app);

// WebSocket
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  if (!req.url.includes("/media-stream")) return;

  console.log("📞 Call connected");

  ws.on("message", () => {
    console.log("🎤 Audio received");
  });

  ws.on("close", () => {
    console.log("❌ Call ended");
  });
});

// Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});