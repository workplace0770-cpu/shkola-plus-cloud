import { env } from "cloudflare:workers";
import { changePassword,createSession,ensureAccountsTable,login,saveEmergencyAdmin,setupAdmin,setupNeeded,userFromRequest } from "../../../db/accounts";
const cookie=(token:string)=>`school_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
export async function POST(r:Request){
 await ensureAccountsTable();const b=await r.json() as {action:string;username?:string;password?:string;newPassword?:string};
 if(b.action==="recover"){if(!b.username||!b.password||b.password.length<8)return Response.json({error:"Пароль должен быть не короче 8 символов"},{status:400});try{const u=await saveEmergencyAdmin(b.username,b.password);if(!u)return Response.json({error:"Аккаунт администратора не найден"},{status:404});await env.DB.prepare("DELETE FROM school_sessions").run();const token=await createSession(u.id);return Response.json({profile:u},{headers:{"Set-Cookie":cookie(token)}})}catch(error){return Response.json({error:`Ошибка хранилища: ${error instanceof Error?error.message:"неизвестная ошибка"}`},{status:500})}}
 if(b.action==="setup"){if(!(await setupNeeded()))return Response.json({error:"Администратор уже создан"},{status:409});if(!b.username||!b.password||b.password.length<8)return Response.json({error:"Пароль должен быть не короче 8 символов"},{status:400});await setupAdmin(b.username,b.password);const u=await login(b.username,b.password),token=await createSession(u!.id);return Response.json({profile:u},{headers:{"Set-Cookie":cookie(token)}})}
 if(b.action==="login"){const u=b.username&&b.password?await login(b.username,b.password):null;if(!u)return Response.json({error:"Неверный логин или пароль"},{status:401});const token=await createSession(u.id);return Response.json({profile:u},{headers:{"Set-Cookie":cookie(token)}})}
 if(b.action==="change"){const u=await userFromRequest(r);if(!u||!b.newPassword||b.newPassword.length<8)return Response.json({error:"Пароль должен быть не короче 8 символов"},{status:400});await changePassword(u.id,b.newPassword);return Response.json({profile:{...u,mustChangePassword:0}})}
 return Response.json({error:"Неизвестная команда"},{status:400});
}
export async function DELETE(){return Response.json({ok:true},{headers:{"Set-Cookie":"school_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"}})}
