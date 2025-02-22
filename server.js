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
  ssl: { rejectUnauthorized: false }, // Agar bisa konek ke Railway
});

// Endpoint: Menambahkan deadline baru
app.post("/api/deadlines", async (req, res) => {
  try {
    const { nama_kegiatan, deadline, email_tujuan } = req.body;

    // Konversi deadline ke format "YYYY-MM-DD HH:mm" dengan timezone Asia/Bangkok (WIB)
    const formattedDeadline = moment(deadline).tz("Asia/Bangkok").format("YYYY-MM-DD HH:mm");
    console.log(`📝 Menyimpan deadline: ${formattedDeadline}`);

    await db.none(
      "INSERT INTO deadlines (nama_kegiatan, deadline, email_tujuan) VALUES ($1, $2, $3)",
      [nama_kegiatan, formattedDeadline, JSON.stringify(email_tujuan)]
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
    debug: true, // Menampilkan log debug
    logger: true, // Menampilkan log proses SMTP
  });

  let mailOptions = {
    from: process.env.EMAIL_USER,
    to: emailList,
    subject: "Reminder Deadline!",
    text: `Halo, ini pengingat bahwa deadline untuk "${namaKegiatan}" jatuh pada ${deadline}. Jangan lupa untuk menyelesaikannya!`,
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    console.log(`📩 Email terkirim ke: ${emailList}`);
    console.log(`✉️ Response: ${info.response}`);
  } catch (error) {
    console.error("❌ Gagal mengirim email:", error);
  }
};

// Cron Job: Mengecek dan mengirim email **setiap menit**
cron.schedule("* * * * *", async () => {
  try {
    // Ambil waktu sekarang dalam format "YYYY-MM-DD HH:mm" sesuai Asia/Bangkok (WIB)
    const now = moment().tz("Asia/Bangkok").format("YYYY-MM-DD HH:mm");
    console.log(`🔍 Mengecek deadline untuk waktu: ${now}`);

    // Ambil daftar tugas yang waktunya sesuai dengan waktu saat ini
    const dueTasks = await db.any(
      "SELECT id, nama_kegiatan, deadline, email_tujuan FROM deadlines WHERE deadline = $1",
      [now]
    );

    if (dueTasks.length === 0) {
      console.log("📭 Tidak ada email yang dikirim saat ini.");
      return;
    }

    for (let task of dueTasks) {
      // Pastikan email_tujuan dikonversi ke array
      const emailList = JSON.parse(task.email_tujuan);

      // Kirim email
      await sendEmail(emailList, task.nama_kegiatan, task.deadline);

      // Hapus deadline setelah email terkirim
      await db.none("DELETE FROM deadlines WHERE id = $1", [task.id]);
      console.log(`🗑️ Deadline "${task.nama_kegiatan}" telah dihapus setelah email dikirim.`);
    }

    console.log(`📩 ${dueTasks.length} email peringatan telah dikirim!`);
  } catch (error) {
    console.error("❌ Gagal mengirim email:", error.message);
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`✅ Server berjalan di port ${PORT}`);
});
