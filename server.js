require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const pgp = require("pg-promise")();
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const moment = require("moment-timezone");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Koneksi ke Database PostgreSQL
const db = pgp({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

// Endpoint: Menambahkan deadline baru
app.post("/api/deadlines", async (req, res) => {
  try {
    const { nama_kegiatan, deadline, email_tujuan } = req.body;

    // Konversi tanggal ke format YYYY-MM-DD dengan timezone Asia/Bangkok
    const formattedDeadline = moment(deadline).tz("Asia/Bangkok").format("YYYY-MM-DD");
    console.log(`📝 Menyimpan deadline: ${formattedDeadline}`);

    await db.none(
      "INSERT INTO deadlines (nama_kegiatan, deadline, email_tujuan) VALUES ($1, $2, $3)",
      [nama_kegiatan, formattedDeadline, email_tujuan]
    );

    res.json({ success: true, message: "Deadline berhasil ditambahkan!" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint: Mendapatkan semua deadline
app.get("/api/deadlines", async (req, res) => {
  try {
    const deadlines = await db.any("SELECT * FROM deadlines");
    res.json({ success: true, data: deadlines });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fungsi untuk mengirim email
const sendEmail = async (emailList, namaKegiatan, deadline) => {
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      debug: true,  // Menampilkan log debug
      logger: true, // Menampilkan log proses SMTP
    });
  
    let mailOptions = {
      from: process.env.EMAIL_USER,
      to: emailList,
      subject: "Reminder Deadline!",
      text: `Halo, ini pengingat bahwa deadline untuk "${namaKegiatan}" jatuh pada ${deadline}. ANJAY BISA`,
    };
  
    try {
      let info = await transporter.sendMail(mailOptions);
      console.log(`📩 Email terkirim ke: ${emailList}`);
      console.log(`✉️ Response: ${info.response}`);
    } catch (error) {
      console.error("❌ Gagal mengirim email:", error);
    }
  };
  


cron.schedule("* * * * *", async () => {
  try {
    // Ambil tanggal sekarang dalam format YYYY-MM-DD sesuai Asia/Bangkok
    const today = moment().tz("Asia/Bangkok").format("YYYY-MM-DD");
    console.log(`🔍 Mengecek deadline untuk tanggal: ${today}`);

    // Mencari deadline yang jatuh pada tanggal tersebut
    const dueTasks = await db.any(
      "SELECT nama_kegiatan, deadline, email_tujuan FROM deadlines WHERE deadline = $1",
      [today]
    );

    if (dueTasks.length === 0) {
      console.log("📭 Tidak ada email yang dikirim hari ini.");
      return;
    }

    for (let task of dueTasks) {
      await sendEmail(task.email_tujuan, task.nama_kegiatan, task.deadline);
    }

    console.log(`📩 ${dueTasks.length} email peringatan telah dikirim!`);
  } catch (error) {
    console.error("❌ Gagal mengirim email:", error.message);
  }
});

// Start Server
app.listen(5000, "0.0.0.0", () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});
