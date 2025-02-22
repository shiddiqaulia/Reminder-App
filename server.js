const express = require("express");
const bodyParser = require("body-parser");
const pgp = require("pg-promise")();
const cors = require("cors");
const schedule = require("node-schedule");
const nodemailer = require("nodemailer");
const moment = require("moment-timezone");

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Koneksi ke database PostgreSQL
const db = pgp({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  ssl: { rejectUnauthorized: false }, // Tambahkan ini agar bisa konek ke Railway
});

// Konfigurasi Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "your-email@gmail.com",
    pass: "your-email-password",
  },
});

// Fungsi untuk mengirim email
const sendEmail = async (emailList, namaKegiatan, deadline, subject, body) => {
  try {
    const mailOptions = {
      from: "your-email@gmail.com",
      to: emailList.join(","),
      subject: subject || `Reminder: ${namaKegiatan}`,
      text: `Pengingat untuk kegiatan: ${namaKegiatan}\n\nDeadline: ${deadline}\n\n${body}`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📩 Email berhasil dikirim ke: ${emailList.join(", ")}`);
  } catch (error) {
    console.error("❌ Gagal mengirim email:", error.message);
  }
};

// Endpoint: Menambahkan deadline dan menjadwalkan email
app.post("/api/deadlines", async (req, res) => {
  try {
    const { nama_kegiatan, deadline, email_tujuan, subject, body } = req.body;
    const formattedDeadline = moment(deadline).tz("Asia/Bangkok").format("YYYY-MM-DD");

    await db.none(
      "INSERT INTO deadlines (nama_kegiatan, deadline, email_tujuan, subject, body, is_sent) VALUES ($1, $2, $3, $4, $5, $6)",
      [nama_kegiatan, formattedDeadline, JSON.stringify(email_tujuan), subject, body, false]
    );

    console.log(`📌 Deadline ditambahkan untuk ${formattedDeadline}`);

    scheduleEmail(formattedDeadline, email_tujuan, nama_kegiatan, subject, body);

    res.json({ success: true, message: "Deadline berhasil ditambahkan dan dijadwalkan!" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fungsi untuk menjadwalkan email pada tanggal deadline
const scheduleEmail = (date, emailList, namaKegiatan, subject, body) => {
  const sendDate = moment(date).tz("Asia/Bangkok").toDate();

  schedule.scheduleJob(sendDate, async () => {
    try {
      const checkSent = await db.oneOrNone(
        "SELECT is_sent FROM deadlines WHERE deadline = $1 AND is_sent = false",
        [date]
      );

      if (!checkSent) {
        console.log(`⏩ Email untuk ${namaKegiatan} sudah pernah dikirim. Tidak mengirim ulang.`);
        return;
      }

      await sendEmail(emailList, namaKegiatan, date, subject, body);
      await db.none("UPDATE deadlines SET is_sent = true WHERE deadline = $1", [date]);

      console.log(`📩 Email untuk ${namaKegiatan} telah dikirim!`);
    } catch (error) {
      console.error("❌ Gagal mengirim email:", error.message);
    }
  });

  console.log(`⏳ Email untuk ${namaKegiatan} dijadwalkan pada ${sendDate}`);
};

// Jalankan server
app.listen(port, () => {
  console.log(`🚀 Server berjalan di http://localhost:${port}`);
});
