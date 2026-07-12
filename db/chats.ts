import { env } from "cloudflare:workers";

export async function ensureChatsTables(){
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS chats(id INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL CHECK(type IN ('direct','class','support')),title TEXT NOT NULL,class_id INTEGER,created_by INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS chat_members(chat_id INTEGER NOT NULL,user_id INTEGER NOT NULL,role TEXT NOT NULL CHECK(role IN ('member','owner')),joined_at TEXT NOT NULL,PRIMARY KEY(chat_id,user_id))"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,chat_id INTEGER NOT NULL,sender_id INTEGER NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,edited_at TEXT,deleted_at TEXT)"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS messages_chat_created_idx ON messages(chat_id,created_at)"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS chat_members_user_id_idx ON chat_members(user_id)"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS chat_members_chat_id_idx ON chat_members(chat_id)"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS chats_class_id_idx ON chats(class_id)"),
 ]);
}

export async function isChatMember(chatId:number,userId:number){
 return Boolean(await env.DB.prepare("SELECT 1 ok FROM chat_members WHERE chat_id=? AND user_id=?").bind(chatId,userId).first());
}

export const chatError=()=>Response.json({error:"Не удалось выполнить операцию с чатом"},{status:500});
