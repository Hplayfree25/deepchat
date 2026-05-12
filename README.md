# DeepChat

DeepChat adalah aplikasi chat berbasis Next.js untuk menjalankan percakapan AI, pengaturan model, persona, memori, dan preview kode secara lokal.

## Kebutuhan

- Node.js 20 atau lebih baru
- pnpm

## Setup Lokal

```bash
pnpm install
pnpm dev
```

Aplikasi berjalan di `http://localhost:3000`.

## Production

```bash
pnpm build
pnpm start
```

Sebelum deploy, pastikan environment variable production sudah diisi di platform deploy. File `.env` dan `.env.*` tidak boleh masuk Git.

## Data Repository

Folder `data/` dipakai untuk data runtime seperti chat, memori, profile, pengaturan LLM, API connection, dan upload sementara. Semua isi asli folder ini bersifat lokal dan tidak boleh masuk GitHub.

Repository hanya menyimpan struktur folder kosong melalui file `.gitkeep`. Data production atau data pribadi harus dibuat ulang oleh aplikasi saat runtime.

Struktur data kosong yang boleh masuk Git:

```text
data/
data/chat/
data/llm/
data/llm/api/
data/temp/
data/temp/file/
data/user/
data/user/memories/
```

## Aturan Commit

- Jangan commit `.env`, API key, token, credential, database lokal, chat history, memory, profile user, upload, cache, build output, atau log.
- Jangan commit file kerja agent, prompt, conversation dump, session dump, atau file vibe coding.
- Gunakan `.env.example` jika perlu dokumentasi nama environment variable tanpa nilai rahasia.
- Jalankan pengecekan ini sebelum push:

```bash
git status --short
git ls-files data
```

Output `git ls-files data` seharusnya hanya berisi file `.gitkeep`.

## Script

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
```
