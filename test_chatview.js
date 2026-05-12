import fs from 'fs';
const content = fs.readFileSync('src/components/chat/ChatView.tsx', 'utf8');
const lines = content.split('\n');
const start = lines.findIndex(l => l.includes('const chunk = decoder.decode(value);'));
console.log(lines.slice(start - 5, start + 15).join('\n'));
