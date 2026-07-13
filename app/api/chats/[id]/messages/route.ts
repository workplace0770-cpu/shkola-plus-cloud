import { env } from "cloudflare:workers";
import { ensureAccountsTable, userFromRequest } from "../../../../../db/accounts";
import { chatError, ensureChatsTables, isChatMember } from "../../../../../db/chats";

type Context={params:Promise<{id:string}>};
async function chatId(context:Context){return Number((await context.params).id)}

export async function GET(r:Request,context:Context){
 try{
  await ensureAccountsTable();await ensureChatsTables();const u=await userFromRequest(r),id=await chatId(context);
  if(!u)return Response.json({error:"Требуется вход"},{status:401});
  if(!id||!await isChatMember(id,u.id))return Response.json({error:"Чат не найден или нет доступа"},{status:403});
  const messages=(await env.DB.prepare(`SELECT * FROM (SELECT m.id,m.chat_id chatId,m.sender_id senderId,m.body,m.created_at createdAt,m.edited_at editedAt,u.full_name senderName
   FROM messages m JOIN school_users u ON u.id=m.sender_id WHERE m.chat_id=? AND m.deleted_at IS NULL ORDER BY m.id DESC LIMIT 100) ORDER BY id ASC`).bind(id).all()).results;
  await env.DB.prepare("UPDATE chat_members SET last_read_at=? WHERE chat_id=? AND user_id=?").bind(new Date().toISOString(),id,u.id).run();
  return Response.json({messages,currentUserId:u.id});
 }catch{return chatError()}
}

export async function POST(r:Request,context:Context){
 try{
  await ensureAccountsTable();await ensureChatsTables();const u=await userFromRequest(r),id=await chatId(context);
  if(!u)return Response.json({error:"Требуется вход"},{status:401});
  if(!id||!await isChatMember(id,u.id))return Response.json({error:"Чат не найден или нет доступа"},{status:403});
  const input=await r.json() as {body?:string},body=String(input.body||"").trim();
  if(body.length<1||body.length>2000)return Response.json({error:"Сообщение должно содержать от 1 до 2000 символов"},{status:400});
  const now=new Date().toISOString();await env.DB.batch([env.DB.prepare("INSERT INTO messages(chat_id,sender_id,body,created_at,edited_at,deleted_at) VALUES(?,?,?,?,NULL,NULL)").bind(id,u.id,body,now),env.DB.prepare("UPDATE chats SET updated_at=? WHERE id=?").bind(now,id),env.DB.prepare("UPDATE chat_members SET last_read_at=? WHERE chat_id=? AND user_id=?").bind(now,id,u.id)]);
  return Response.json({ok:true},{status:201});
 }catch{return chatError()}
}

export async function PATCH(r:Request,context:Context){
 try{
  await ensureAccountsTable();await ensureChatsTables();const u=await userFromRequest(r),id=await chatId(context);
  if(!u)return Response.json({error:"Требуется вход"},{status:401});
  if(!id||!await isChatMember(id,u.id))return Response.json({error:"Нет доступа"},{status:403});
  const input=await r.json() as {messageId?:number;body?:string},messageId=Number(input.messageId),body=String(input.body||"").trim();
  if(body.length<1||body.length>2000)return Response.json({error:"Сообщение должно содержать от 1 до 2000 символов"},{status:400});
  const own=await env.DB.prepare("SELECT id FROM messages WHERE id=? AND chat_id=? AND sender_id=? AND deleted_at IS NULL").bind(messageId,id,u.id).first();
  if(!own)return Response.json({error:"Можно изменить только своё сообщение"},{status:403});
  await env.DB.prepare("UPDATE messages SET body=?,edited_at=? WHERE id=?").bind(body,new Date().toISOString(),messageId).run();return Response.json({ok:true});
 }catch{return chatError()}
}

export async function DELETE(r:Request,context:Context){
 try{
  await ensureAccountsTable();await ensureChatsTables();const u=await userFromRequest(r),id=await chatId(context);
  if(!u)return Response.json({error:"Требуется вход"},{status:401});
  if(!id||!await isChatMember(id,u.id))return Response.json({error:"Нет доступа"},{status:403});
  const {messageId}=await r.json() as {messageId?:number};
  const own=await env.DB.prepare("SELECT id FROM messages WHERE id=? AND chat_id=? AND sender_id=? AND deleted_at IS NULL").bind(Number(messageId),id,u.id).first();
  if(!own)return Response.json({error:"Можно удалить только своё сообщение"},{status:403});
  await env.DB.prepare("UPDATE messages SET deleted_at=? WHERE id=?").bind(new Date().toISOString(),Number(messageId)).run();return Response.json({ok:true});
 }catch{return chatError()}
}
