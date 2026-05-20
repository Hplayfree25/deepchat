<div align="center">
  <img src="./public/icon.svg" alt="Logo DeepChat" width="120" height="120" />

  # DeepChat

  <p align="center">
    <strong>Ruang kerja percakapan dan lingkungan agen AI lokal generasi berikutnya.</strong>
  </p>

  <p align="center">
    <a href="https://img.shields.io/badge/status-active_development-blue?style=for-the-badge"><img src="https://img.shields.io/badge/status-dalam_pengembangan-blue?style=for-the-badge" alt="Status" /></a>
    <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16.2.4-black?style=for-the-badge&logo=nextdotjs" alt="Next.js" /></a>
    <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19.2.4-087EA4?style=for-the-badge&logo=react&logoColor=white" alt="React" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" /></a>
    <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind_CSS-4.x-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" /></a>
    <a href="https://pnpm.io/"><img src="https://img.shields.io/badge/pnpm-ready-F69220?style=for-the-badge&logo=pnpm&logoColor=white" alt="pnpm" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-16A34A?style=for-the-badge" alt="Lisensi MIT" /></a>
  </p>

  <p align="center">
    <a href="./README.md"><strong>English Version (README.md)</strong></a>
  </p>
</div>

---

DeepChat adalah ruang kerja percakapan berbasis lokal yang kaya fitur dan dibangun menggunakan Next.js, React, dan TypeScript. Terinspirasi oleh antarmuka dinamis milik ChatGPT serta fleksibilitas berbasis agen dari OpenClaw, DeepChat menghadirkan tampilan modern untuk eksperimen model tingkat lanjut, ekstraksi memori jangka panjang, eksekusi kode interaktif di lingkungan terisolasi (sandbox), dan penyesuaian perilaku asisten AI.

> [!WARNING]
> Aplikasi ini saat ini sedang dalam status **pengembangan aktif**. Fitur-fitur tertentu dapat berubah, diperbarui, atau disempurnakan seiring berjalannya penyetabilan repositori ke standar produksi.

---

## Fitur Utama

### Desain UI/UX Mengutamakan Perangkat Seluler (Mobile-First)
- Antarmuka responsif yang dirancang dengan memprioritaskan perangkat seluler (mobile screen), lalu disesuaikan dengan mulus untuk komputer desktop.
- Desain modern dan premium yang dilengkapi dengan efek glassmorphism, animasi halus berbasis Framer Motion, serta fokus tinggi pada pengalaman pengguna.
- Tema gelap dan terang yang disesuaikan secara khusus, bilah samping (sidebar) yang dapat disembunyikan, dan panel kontrol yang dinamis.

### Memori Jangka Panjang & Konteks Semantik
- Ekstraksi memori otomatis di latar belakang untuk membangun pemahaman yang dipersonalisasi dari profil pengguna.
- Memori terstruktur yang disimpan secara persisten dan dikelompokkan berdasarkan tingkat kepentingan, waktu, dan jenis konten.
- Pelacakan riwayat yang mendukung penelusuran semantik di berbagai sesi obrolan yang berbeda.

### Integrasi Mendalam Model Context Protocol (MCP)
- Terhubung langsung dengan server Model Context Protocol untuk memperluas kemampuan model menggunakan perkakas lokal maupun jaringan.
- Pengaturan izin MCP yang mendalam, konfigurasi peralatan runtime, dan pembatasan keamanan.
- Pengalih penyedia bawaan yang didukung secara native oleh Google GenAI SDK (model Gemini).

### Alur Kerja Developer & Sandbox Kode
- Tampilan Markdown lengkap dengan dukungan rumus matematika LaTeX (KaTeX) serta render GFM.
- Pewarnaan sintaksis menggunakan Shiki untuk meningkatkan kenyamanan membaca kode layaknya editor profesional.
- Modul eksekusi kode terisolasi (sandbox) untuk membangun, melihat pratinjau, dan menguji kode yang dihasilkan di dalam sesi langsung.

### Berbasis Lokal & Menjaga Privasi (Local-First)
- Penyimpanan data lokal penuh menggunakan SQLite via better-sqlite3 dan pemetaan skema berbasis Drizzle ORM yang aman.
- Direktori data pribadi di mana obrolan, log, berkas temporer, dan profil pengguna tetap berada sepenuhnya di komputer Anda.

---

## Tampilan Antarmuka

### Halaman Beranda
![Halaman Beranda DeepChat](./docs/screenshots/deepchat-home.png)

### Halaman Percakapan
![Halaman Percakapan DeepChat](./docs/screenshots/deepchat-chat.png)

---

## Memulai (Windows)

DeepChat telah dilengkapi dengan peluncur otomatis (launcher) berbasis Windows untuk memudahkan penggunaan sehari-hari. Anda tidak perlu mengelola instalasi manual, dependensi paket, atau server web melalui konsol secara rumit.

### Cara Termudah: Menggunakan deepchat.bat

Untuk menjalankan DeepChat, cukup klik dua kali berkas **deepchat.bat** di folder utama proyek ini.

#### Apa yang dilakukan oleh peluncur otomatis ini di latar belakang?
1. **Penyusunan Folder Otomatis:** Secara aman membangun struktur folder di dalam direktori `data/` untuk menyimpan percakapan, memori, berkas temporer, dan log.
2. **Manajemen Dependensi Pintar:** Memeriksa apakah paket dependensi lokal telah terpasang. Jika belum, peluncur akan melakukan instalasi secara otomatis di latar belakang menggunakan `pnpm@10` dengan konfigurasi kompilasi yang sesuai.
3. **Kompilasi Inkremental Cerdas:** Membandingkan waktu perubahan berkas kode di folder `src/`, `public/`, dan konfigurasi proyek dengan build produksi terakhir. Jika ada perubahan baru, proyek akan dibangun ulang; jika tidak, tahap build akan dilewati untuk mempercepat waktu start.
4. **Alokasi Port & Deteksi PID:** Memvalidasi ketersediaan port jaringan. Jika port 3000 sedang digunakan oleh proses DeepChat sebelumnya, sistem akan menawarkan pilihan untuk melakukan restart, mematikan proses (PID) yang mengunci port, atau membuka langsung di peramban (browser).
5. **Deteksi Jaringan Lokal (LAN) Otomatis:** Memindai dan menampilkan alamat IP komputer Anda di jaringan lokal (LAN). Ini memudahkan Anda untuk mengakses dan berinteraksi dengan DeepChat melalui ponsel, tablet, atau perangkat lainnya di jaringan yang sama.
6. **Penyaringan & Pengalihan Log:** Menyaring log standar server yang tidak penting dan memfokuskan tampilan konsol pada alur logika sistem serta proses berpikir AI (`[AI]` reasoning) dengan kode warna yang rapi. Membuka peramban secara otomatis ketika server telah siap digunakan.

---

## Perintah Manual & Lanjutan

Bagi developer yang lebih menyukai kendali penuh melalui terminal, DeepChat mendukung perintah terstandarisasi menggunakan pnpm:

### Pemasangan Dependensi
Gunakan perintah berikut untuk memasang dependensi secara manual:
```bash
pnpm install
```

### Server Pengembangan (Development)
Menjalankan server pengembangan lokal dengan fitur Turbopack untuk pembaruan instan:
```bash
pnpm dev
```

### Server Produksi (Production)
Membangun paket siap rilis:
```bash
pnpm build
```
Menjalankan paket produksi yang telah dibangun:
```bash
pnpm start
```
Melakukan pengecekan kualitas kode (linting):
```bash
pnpm lint
```

---

## Arsitektur Direktori

```text
deepchat/
├── data/                       # Berkas runtime lokal (diabaikan oleh git)
│   ├── chat/                   # Sesi pengguna dan snapshot obrolan
│   ├── llm/                    # Konfigurasi koneksi dan profil prompt
│   ├── temp/                   # Berkas sesi dan unduhan temporer
│   ├── user/                   # Penyimpanan memori dan metadata pengguna
│   ├── backups/                # Salinan cadangan basis data berkala
│   └── logs/                   # Log runtime dan riwayat sistem
├── docs/                       # Dokumentasi teknis dan panduan penggunaan
│   └── screenshots/            # Referensi tampilan visual
├── public/                     # Aset statis aplikasi
│   ├── icon.svg                # Logo utama aplikasi
│   └── icons/                  # Paket ikon modular
├── scripts/                    # Skrip otomasi sistem
│   └── deepchat-launcher.ps1   # Skrip PowerShell di balik layar deepchat.bat
├── src/                        # Struktur utama React/Next.js
│   ├── app/                    # Halaman rute, tindakan server, tata letak, dan gaya
│   ├── components/             # Komponen antarmuka yang dapat digunakan kembali
│   └── lib/                    # Pengaturan MCP, lapisan basis data, dan generator
├── package.json                # Manifest proyek dan daftar dependensi
├── tsconfig.json               # Konfigurasi TypeScript dan aturan kompilasi
└── deepchat.bat                # Berkas peluncur interaktif Windows
```

---

## Status & Rencana Masa Depan

Aplikasi ini terus berkembang pesat sebagai ruang kerja kecerdasan buatan berbasis lokal. Rencana pengembangan berikutnya meliputi:
- Orkestrasi orisinal multi-model AI secara paralel.
- Integrasi basis data vektor tingkat lanjut untuk pemanggilan memori jangka panjang yang lebih cerdas.
- Penguatan sistem pipa perkakas dan peningkatan sistem keamanan eksekusi kode eksternal.
- Penyempurnaan fitur dan kemudahan integrasi dengan ekosistem Model Context Protocol.

---

## Lisensi

DeepChat adalah perangkat lunak sumber terbuka (open-source) yang didistribusikan di bawah [Lisensi MIT](./LICENSE). Semua penyimpanan lokal, alur pembuatan konten, dan modul penyesuaian bebas digunakan, dimodifikasi, serta dideploy secara mandiri.
