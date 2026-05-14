import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  title: text('title'),
  createdAt: text('created_at').notNull(),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  isShared: integer('is_shared', { mode: 'boolean' }).notNull().default(false),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  shareId: text('share_id'),
  folder: text('folder'),
  ownerProfileJson: text('owner_profile_json'),
  tagsJson: text('tags_json'),
  pendingAttachedFilesJson: text('pending_attached_files_json'),
  extraJson: text('extra_json')
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  chatId: text('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  role: text('role'),
  content: text('content'),
  reasoning: text('reasoning'),
  reasoningDurationJson: text('reasoning_duration_json'),
  createdAt: text('created_at'),
  isStreaming: integer('is_streaming', { mode: 'boolean' }),
  isError: integer('is_error', { mode: 'boolean' }),
  chatIndex: integer('chat_index').notNull(),
  attachedFilesJson: text('attached_files_json'),
  attachedFileJson: text('attached_file_json'),
  versionsJson: text('versions_json'),
  currentVersionIndex: integer('current_version_index'),
  extraJson: text('extra_json')
});

export const sharedChats = sqliteTable('shared_chats', {
  shareId: text('share_id').primaryKey(),
  chatId: text('chat_id').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  createdAt: text('created_at').notNull()
});

export const savedMemories = sqliteTable('saved_memories', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  category: text('category').notNull(),
  importance: text('importance').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  sourceProvider: text('source_provider'),
  sourceModel: text('source_model'),
  sourceConnectionId: text('source_connection_id'),
  sourceChatId: text('source_chat_id'),
  vectorJson: text('vector_json')
});

export const chatHistoryMemories = sqliteTable('chat_history_memories', {
  id: text('id').primaryKey(),
  chatId: text('chat_id'),
  userMessage: text('user_message').notNull(),
  assistantMessage: text('assistant_message').notNull(),
  createdAt: text('created_at').notNull(),
  sourceProvider: text('source_provider'),
  sourceModel: text('source_model'),
  sourceConnectionId: text('source_connection_id'),
  sourceUserMessageId: text('source_user_message_id'),
  vectorJson: text('vector_json')
});

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  chatId: text('chat_id'),
  messageId: text('message_id'),
  name: text('name').notNull(),
  ext: text('ext').notNull(),
  filePath: text('file_path').notNull(),
  createdAt: text('created_at').notNull()
});
