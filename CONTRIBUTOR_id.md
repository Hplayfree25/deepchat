# Berkontribusi di DeepChat

Selamat datang! Terima kasih banyak telah meluangkan waktu untuk berkontribusi di DeepChat. Proyek ini adalah ruang kerja percakapan AI berbasis lokal yang dirancang agar cepat, privat, dan mudah disesuaikan. Kami sangat senang Anda bergabung dalam perjalanan pengembangan ini.

Kami ingin proses kontribusi menjadi sesederhana, semenyenangkan, dan sebermanfaat mungkin. Untuk memastikan semua orang merasa disambut dan basis kode kami tetap menyenangkan untuk dikerjakan, kami menjaga agar panduan kontribusi ini tetap ramah, santai, dan mudah diikuti.

---

## Selamat Bergabung di Tim

Baik Anda memperbaiki saltik kecil, meningkatkan tampilan seluler, menambahkan penyedia model AI baru, atau mengusulkan fitur utama yang baru, bantuan Anda sangat kami hargai. DeepChat sedang dalam pengembangan aktif, dan kami menghargai setiap pull request yang masuk.

---

## Memulai dengan Mudah

Kami menggunakan perkakas modern namun sederhana agar persiapan lingkungan pengembangan Anda berjalan tanpa hambatan:

1. **Pengelola Paket:** Kami menggunakan pnpm untuk mengelola dependensi karena kinerjanya yang cepat dan efisien. Untuk memulai, cukup jalankan perintah:
```bash
pnpm install
```
2. **Menjalankan Aplikasi:** Jika Anda menggunakan Windows, Anda dapat langsung menjalankan aplikasi dengan mengklik dua kali berkas:
```text
deepchat.bat
```
Berkas bat ini akan otomatis menangani semuanya mulai dari pembuatan folder, pengecekan port lokal, kompilasi, hingga membuka peramban Anda secara otomatis.

---

## Panduan Kode Sederhana

Untuk menjaga proyek ini tetap bersih dan mudah dipahami oleh semua orang, kami menyarankan beberapa praktik sederhana berikut:

- **Gunakan Komentar Penjelas:** Kami sangat menyambut penggunaan komentar! Jika Anda menulis logika yang kompleks, membuat hook kustom, atau mengatur operasi basis data, silakan tambahkan komentar yang jelas untuk menjelaskan cara kerja kode Anda. Ini sangat membantu kontributor lain memahami alur berpikir Anda.
- **Tulis Kode yang Mudah Dibaca:** Cobalah untuk menggunakan nama variabel dan fungsi yang ringkas namun jelas. Kode yang mudah dibaca memudahkan kita semua untuk berkolaborasi.
- **Desain Ramah Seluler (Mobile-First):** Karena banyak pengguna yang menikmati obrolan ini melalui ponsel dan tablet mereka, cobalah untuk membuat perubahan UI Anda terlihat bagus di layar kecil terlebih dahulu, baru kemudian disesuaikan untuk tampilan desktop.
- **Uji Perubahan Anda:** Sebelum mengirimkan pull request, lakukan pemeriksaan build dan lint singkat untuk memastikan semuanya berjalan lancar:
```bash
pnpm build
pnpm lint
```

---

## Cara Mengirimkan Kontribusi Anda

1. Lakukan fork pada repositori ini dan buat cabang (branch) baru dari main.
2. Lakukan perubahan Anda dan uji secara lokal menggunakan deepchat.bat atau pnpm dev.
3. Commit perubahan Anda dengan deskripsi yang jelas dan sederhana mengenai apa yang telah Anda lakukan.
4. Push cabang Anda dan ajukan Pull Request. Kami akan meninjaunya secepat mungkin dan bekerja sama dengan Anda untuk menggabungkannya.

Terima kasih sekali lagi telah membantu membuat DeepChat menjadi lebih baik untuk semua orang. Selamat menulis kode!
