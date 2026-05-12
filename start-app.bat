@echo off
echo Memulai DeepChat versi cepat (Production Build)...
echo.

:: Cek apakah folder .next ada (apakah sudah dibuild?)
if not exist ".next" (
    echo Build belum ditemukan. Melakukan build pertama kali...
    call pnpm run build
)

:: Buka browser secara otomatis setelah delay sebentar
start "" http://localhost:3000

:: Jalankan server production Next.js
call pnpm start
