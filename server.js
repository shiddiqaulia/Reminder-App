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
  ssl: { rejectUnauthorized: false }, // Railway SSL
});

// Endpoint: Menambahkan deadline baru
app.post("/api/deadlines", async (req, res) => {
  try {
    const { nama_kegiatan, deadline, email_tujuan, subject, body } = req.body;

    // Pastikan subject dan body tidak kosong
    if (!subject || !body) {
      return res.status(400).json({ success: false, message: "Subject dan body tidak boleh kosong!" });
    }

    // Konversi tanggal ke format YYYY-MM-DD dengan timezone Asia/Bangkok
    const formattedDeadline = moment(deadline).tz("Asia/Bangkok").format("YYYY-MM-DD");

    console.log(`📝 Menyimpan deadline: ${formattedDeadline}`);

    await db.none(
      "INSERT INTO deadlines (nama_kegiatan, deadline, email_tujuan, subject, body, is_sent) VALUES ($1, $2, $3, $4, $5, FALSE)",
      [nama_kegiatan, formattedDeadline, JSON.stringify(email_tujuan), subject, body]
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

// Endpoint: Menghapus deadline berdasarkan ID
app.delete("/api/deadlines/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Periksa apakah ID yang dimasukkan ada dalam database
    const deadline = await db.oneOrNone("SELECT * FROM deadlines WHERE id = $1", [id]);

    if (!deadline) {
      return res.status(404).json({ success: false, message: "Deadline tidak ditemukan!" });
    }

    // Hapus deadline berdasarkan ID
    await db.none("DELETE FROM deadlines WHERE id = $1", [id]);

    res.json({ success: true, message: "Deadline berhasil dihapus!" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint: Memperbarui deadline berdasarkan ID
app.put("/api/deadlines/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { nama_kegiatan, deadline, email_tujuan, subject, body } = req.body;

    // Pastikan semua data yang diperlukan ada
    if (!nama_kegiatan || !deadline || !subject || !body) {
      return res.status(400).json({ success: false, message: "Semua field harus diisi!" });
    }

    // Cek apakah deadline dengan ID tersebut ada di database
    const existingDeadline = await db.oneOrNone("SELECT * FROM deadlines WHERE id = $1", [id]);

    if (!existingDeadline) {
      return res.status(404).json({ success: false, message: "Deadline tidak ditemukan!" });
    }

    // Konversi tanggal ke format yang sesuai
    const formattedDeadline = moment(deadline).tz("Asia/Bangkok").format("YYYY-MM-DD");

    // Lakukan update pada database
    await db.none(
      "UPDATE deadlines SET nama_kegiatan = $1, deadline = $2, email_tujuan = $3, subject = $4, body = $5 WHERE id = $6",
      [nama_kegiatan, formattedDeadline, JSON.stringify(email_tujuan), subject, body, id]
    );

    res.json({ success: true, message: "Deadline berhasil diperbarui!" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fungsi untuk mengirim email
const sendEmail = async (emailList, subject, body) => {
  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  let mailOptions = {
    from: process.env.EMAIL_USER,
    to: emailList,
    subject: subject, // Gunakan subject dari database
    text: body, // Gunakan body dari database
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    console.log(`📩 Email terkirim ke: ${emailList}`);
    return true;
  } catch (error) {
    console.error("❌ Gagal mengirim email:", error);
    return false;
  }
};

// Cron job untuk mengirim email sekali saja
cron.schedule("* * * * *", async () => {
  try {
    // Ambil tanggal sekarang dalam format YYYY-MM-DD sesuai Asia/Bangkok
    const today = moment().tz("Asia/Bangkok").format("YYYY-MM-DD");
    console.log(`🔍 Mengecek deadline untuk tanggal: ${today}`);

    // Mencari deadline yang jatuh pada tanggal tersebut dan belum dikirim
    const dueTasks = await db.any(
      "SELECT id, nama_kegiatan, deadline, email_tujuan, subject, body FROM deadlines WHERE deadline = $1 AND is_sent = FALSE",
      [today]
    );

    if (dueTasks.length === 0) {
      console.log("📭 Tidak ada email yang dikirim hari ini.");
      return;
    }

    for (let task of dueTasks) {
      let emailSent = await sendEmail(task.email_tujuan, task.subject, task.body);
      if (emailSent) {
        await db.none("UPDATE deadlines SET is_sent = TRUE WHERE id = $1", [task.id]);
      }
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
