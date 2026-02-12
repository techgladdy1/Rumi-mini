const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const axios = require('axios');
const { MongoClient } = require('mongodb');
const {
  default: makeWASocket, useMultiFileAuthState, delay,
  getContentType, makeCacheableSignalKeyStore, Browsers,
  jidNormalizedUser, downloadContentFromMessage, DisconnectReason
} = require('baileys');

// ==================== CONFIG ====================
const BOT_NAME = 'ʀᴜᴍɪ-ɪɪ';
const config = {
  AUTO_VIEW_STATUS: 'true', AUTO_LIKE_STATUS: 'true', AUTO_RECORDING: 'true',
  AUTO_LIKE_EMOJI: ['🌸','🪴','💫','🍂','🌟','🫀','👀','🤖','🚩','🥰','🗿','💜','💙','🌝','🖤','💚'],
  PREFIX: '.', MAX_RETRIES: 3,
  GROUP_INVITE_LINK: 'https://chat.whatsapp.com/Dh7gxX9AoVD8gsgWUkhB9r',
  IMAGE_PATH: 'https://files.catbox.moe/f9gwsx.jpg',
  NEWSLETTER_JID: '120363402507750390@newsletter', OTP_EXPIRY: 300000,
  OWNER_NUMBER: process.env.OWNER_NUMBER || '263775953409',
  OWNER_NAME: 'ɢʟᴀᴅᴅʏᴋɪɴɢ', BOT_NAME: 'ʀᴜᴍɪ-ɪɪ', BOT_VERSION: '2.0.0',
  BOT_FOOTER: '> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʀᴜᴍɪ-ɪɪ',
  CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbB3YxTDJ6H15SKoBv3S',
  SUPPORT_NEWSLETTER: { jid:'120363402507750390@newsletter', emojis:['❤️','🌟','🔥','💯'], name:'RUMI-II Updates', description:'Bot updates' },
  DEFAULT_NEWSLETTERS: [{ jid:'120363402507750390@newsletter', emojis:['❤️','🌟','🔥','💯'], name:'RUMI-II', description:'RUMI-II Channel' }]
};

// ==================== MONGO ====================
const MONGO_URI = process.env.MONGO_URI||'mongodb+srv://malvintech11_db_user:0SBgxRy7WsQZ1KTq@cluster0.xqgaovj.mongodb.net/?appName=Cluster0';
const MONGO_DB = process.env.MONGO_DB||'RUMI_II';
let mongoClient,mongoDB,sessionsCol,numbersCol,adminsCol,newsletterCol,configsCol,newsletterReactsCol;
async function initMongo(){
  try{if(mongoClient&&mongoClient.topology&&mongoClient.topology.isConnected&&mongoClient.topology.isConnected())return;}catch(e){}
  mongoClient=new MongoClient(MONGO_URI,{useNewUrlParser:true,useUnifiedTopology:true});
  await mongoClient.connect(); mongoDB=mongoClient.db(MONGO_DB);
  sessionsCol=mongoDB.collection('sessions'); numbersCol=mongoDB.collection('numbers');
  adminsCol=mongoDB.collection('admins'); newsletterCol=mongoDB.collection('newsletter_list');
  configsCol=mongoDB.collection('configs'); newsletterReactsCol=mongoDB.collection('newsletter_reacts');
  await sessionsCol.createIndex({number:1},{unique:true}); await numbersCol.createIndex({number:1},{unique:true});
  await newsletterCol.createIndex({jid:1},{unique:true}); await newsletterReactsCol.createIndex({jid:1},{unique:true});
  await configsCol.createIndex({number:1},{unique:true}); console.log('✅ RUMI-II Mongo initialized');
}
async function saveCredsToMongo(n,c,k=null){try{await initMongo();const s=n.replace(/[^0-9]/g,'');await sessionsCol.updateOne({number:s},{$set:{number:s,creds:c,keys:k,updatedAt:new Date()}},{upsert:true});}catch(e){console.error('saveCreds:',e);}}
async function loadCredsFromMongo(n){try{await initMongo();const s=n.replace(/[^0-9]/g,'');return await sessionsCol.findOne({number:s})||null;}catch(e){return null;}}
async function removeSessionFromMongo(n){try{await initMongo();await sessionsCol.deleteOne({number:n.replace(/[^0-9]/g,'')});}catch(e){}}
async function addNumberToMongo(n){try{await initMongo();const s=n.replace(/[^0-9]/g,'');await numbersCol.updateOne({number:s},{$set:{number:s}},{upsert:true});}catch(e){}}
async function removeNumberFromMongo(n){try{await initMongo();await numbersCol.deleteOne({number:n.replace(/[^0-9]/g,'')});}catch(e){}}
async function getAllNumbersFromMongo(){try{await initMongo();return(await numbersCol.find({}).toArray()).map(d=>d.number);}catch(e){return[];}}
async function loadAdminsFromMongo(){try{await initMongo();return(await adminsCol.find({}).toArray()).map(d=>d.jid||d.number).filter(Boolean);}catch(e){return[];}}
async function addAdminToMongo(j){try{await initMongo();await adminsCol.updateOne({jid:j},{$set:{jid:j}},{upsert:true});}catch(e){}}
async function removeAdminFromMongo(j){try{await initMongo();await adminsCol.deleteOne({jid:j});}catch(e){}}
async function addNewsletterToMongo(j,e=[]){try{await initMongo();await newsletterCol.updateOne({jid:j},{$set:{jid:j,emojis:e,addedAt:new Date()}},{upsert:true});}catch(e){throw e;}}
async function removeNewsletterFromMongo(j){try{await initMongo();await newsletterCol.deleteOne({jid:j});}catch(e){throw e;}}
async function listNewslettersFromMongo(){try{await initMongo();return(await newsletterCol.find({}).toArray()).map(d=>({jid:d.jid,emojis:Array.isArray(d.emojis)?d.emojis:[]}));}catch(e){return[];}}
async function saveNewsletterReaction(j,mid,em,sn){try{await initMongo();await mongoDB.collection('newsletter_reactions_log').insertOne({jid:j,messageId:mid,emoji:em,sessionNumber:sn,ts:new Date()});}catch(e){}}
async function setUserConfigInMongo(n,c){try{await initMongo();const s=n.replace(/[^0-9]/g,'');await configsCol.updateOne({number:s},{$set:{number:s,config:c,updatedAt:new Date()}},{upsert:true});}catch(e){}}
async function loadUserConfigFromMongo(n){try{await initMongo();const s=n.replace(/[^0-9]/g,'');const d=await configsCol.findOne({number:s});return d?d.config:null;}catch(e){return null;}}
async function listNewsletterReactsFromMongo(){try{await initMongo();return(await newsletterReactsCol.find({}).toArray()).map(d=>({jid:d.jid,emojis:Array.isArray(d.emojis)?d.emojis:[]}));}catch(e){return[];}}

// ==================== UTILS ====================
function formatMessage(t,c,f){return `*${t}*\n\n${c}\n\n> *${f}*`;}
function generateOTP(){return Math.floor(100000+Math.random()*900000).toString();}
function getTimestamp(){return moment().tz('Africa/Harare').format('YYYY-MM-DD HH:mm:ss');}
function randomElement(a){return a[Math.floor(Math.random()*a.length)];}

const activeSockets=new Map(), socketCreationTime=new Map(), otpStore=new Map();

// ==================== FAKE VCARD ====================
const fakevcard={
  key:{remoteJid:'status@broadcast',participant:'0@s.whatsapp.net',fromMe:false,id:'RUMI_II_FAKE_ID'},
  message:{contactMessage:{displayName:'ʀᴜᴍɪ-ɪɪ',vcard:`BEGIN:VCARD\nVERSION:3.0\nN:RUMI;;;;\nFN:RUMI-II\nORG:GladdyKing\nTEL;type=CELL;type=VOICE;waid=263775953409:+263775953409\nEND:VCARD`}}
};

// ==================== HELPERS ====================
async function joinGroup(socket){
  let r=config.MAX_RETRIES; const m=(config.GROUP_INVITE_LINK||'').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if(!m)return{status:'failed',error:'No group invite'};
  const code=m[1];
  while(r>0){try{const res=await socket.groupAcceptInvite(code);if(res?.gid)return{status:'success',gid:res.gid};throw new Error('No gid');}catch(e){r--;if(r===0)return{status:'failed',error:e.message};await delay(2000);}}
  return{status:'failed',error:'Max retries'};
}
async function sendAdminConnectMessage(socket,number,groupResult,sessionConfig={}){
  const admins=await loadAdminsFromMongo(); const botName=sessionConfig.botName||BOT_NAME; const image=sessionConfig.logo||config.IMAGE_PATH;
  const caption=formatMessage(botName,`*📞 Number:* ${number}\n*🩵 Status:* ${groupResult.status==='success'?`Joined (ID: ${groupResult.gid})`:`Failed: ${groupResult.error}`}\n*🕒 Connected At:* ${getTimestamp()}`,botName);
  for(const admin of admins){try{const to=admin.includes('@')?admin:`${admin}@s.whatsapp.net`;await socket.sendMessage(to,{image:{url:image},caption});}catch(e){}}
}
async function sendOTP(socket,number,otp){
  const userJid=jidNormalizedUser(socket.user.id);
  await socket.sendMessage(userJid,{text:formatMessage(`*🔐 OTP — ${BOT_NAME}*`,`*Your OTP:* *${otp}*\n*Expires in 5 minutes.*\n\n*Number:* ${number}`,BOT_NAME)});
}
async function setupNewsletterHandlers(socket,sessionNumber){
  const rrPointers=new Map();
  socket.ev.on('messages.upsert',async({messages})=>{
    const message=messages[0]; if(!message?.key)return; const jid=message.key.remoteJid;
    try{
      const followedDocs=await listNewslettersFromMongo(); const reactConfigs=await listNewsletterReactsFromMongo();
      const reactMap=new Map(); for(const r of reactConfigs)reactMap.set(r.jid,r.emojis||[]);
      const followedJids=followedDocs.map(d=>d.jid);
      if(!followedJids.includes(jid)&&!reactMap.has(jid))return;
      let emojis=reactMap.get(jid)||followedDocs.find(d=>d.jid===jid)?.emojis||config.AUTO_LIKE_EMOJI;
      let idx=rrPointers.get(jid)||0; const emoji=emojis[idx%emojis.length]; rrPointers.set(jid,(idx+1)%emojis.length);
      const messageId=message.newsletterServerId||message.key.id; if(!messageId)return;
      let retries=3;
      while(retries-->0){try{if(typeof socket.newsletterReactMessage==='function')await socket.newsletterReactMessage(jid,messageId.toString(),emoji);else await socket.sendMessage(jid,{react:{text:emoji,key:message.key}});await saveNewsletterReaction(jid,messageId.toString(),emoji,sessionNumber);break;}catch(e){await delay(1200);}}
    }catch(e){}
  });
}
async function setupStatusHandlers(socket){
  socket.ev.on('messages.upsert',async({messages})=>{
    const message=messages[0]; if(!message?.key||message.key.remoteJid!=='status@broadcast'||!message.key.participant)return;
    try{
      if(config.AUTO_RECORDING==='true')await socket.sendPresenceUpdate('recording',message.key.remoteJid);
      if(config.AUTO_VIEW_STATUS==='true')await socket.readMessages([message.key]);
      if(config.AUTO_LIKE_STATUS==='true'){const emoji=randomElement(config.AUTO_LIKE_EMOJI);await socket.sendMessage(message.key.remoteJid,{react:{text:emoji,key:message.key}},{statusJidList:[message.key.participant]});}
    }catch(e){}
  });
}
async function handleMessageRevocation(socket){
  socket.ev.on('messages.delete',async({keys})=>{
    if(!keys||keys.length===0)return;
    const key=keys[0]; const userJid=jidNormalizedUser(socket.user.id);
    try{await socket.sendMessage(userJid,{image:{url:config.IMAGE_PATH},caption:formatMessage('*🗑️ MESSAGE DELETED*',`*From:* ${key.remoteJid}\n*Time:* ${getTimestamp()}`,BOT_NAME)});}catch(e){}
  });
}

// ==================== COMMAND HANDLER ====================
function setupCommandHandlers(socket,number){
  socket.ev.on('messages.upsert',async({messages})=>{
    const msg=messages[0];
    if(!msg||!msg.message||msg.key.remoteJid==='status@broadcast')return;
    const type=getContentType(msg.message);
    msg.message=(type==='ephemeralMessage')?msg.message.ephemeralMessage.message:msg.message;
    const from=msg.key.remoteJid;
    const sender=from;
    const nowsender=msg.key.fromMe?(socket.user.id.split(':')[0]+'@s.whatsapp.net'):(msg.key.participant||msg.key.remoteJid);
    const senderNumber=(nowsender||'').split('@')[0];
    const isOwner=senderNumber===config.OWNER_NUMBER.replace(/[^0-9]/g,'');
    const isGroup=from.endsWith('@g.us');
    const body=(type==='conversation')?msg.message.conversation
      :(type==='extendedTextMessage')?msg.message.extendedTextMessage.text
      :(type==='imageMessage'&&msg.message.imageMessage.caption)?msg.message.imageMessage.caption
      :(type==='videoMessage'&&msg.message.videoMessage.caption)?msg.message.videoMessage.caption
      :(type==='buttonsResponseMessage')?msg.message.buttonsResponseMessage?.selectedButtonId
      :(type==='listResponseMessage')?msg.message.listResponseMessage?.singleSelectReply?.selectedRowId:'';
    if(!body||typeof body!=='string')return;
    const prefix=config.PREFIX;
    if(!body.startsWith(prefix))return;
    const command=body.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase();
    const args=body.trim().split(/\s+/).slice(1);
    const q=args.join(' ').trim();

    async function reply(text){await socket.sendMessage(sender,{text},{quoted:msg});}
    async function react(emoji){try{await socket.sendMessage(sender,{react:{text:emoji,key:msg.key}});}catch(e){}}
    async function replyBtn(text,buttons,footer=config.BOT_FOOTER){await socket.sendMessage(sender,{text,footer,buttons},{quoted:fakevcard});}
    async function replyImgBtn(imgUrl,caption,buttons,footer=config.BOT_FOOTER){await socket.sendMessage(sender,{image:{url:imgUrl},caption,footer,buttons,headerType:4},{quoted:fakevcard});}
    function uptime(){const s=socketCreationTime.get(number)||Date.now();const u=Math.floor((Date.now()-s)/1000);return `${Math.floor(u/3600)}h ${Math.floor((u%3600)/60)}m ${u%60}s`;}

    try{
      switch(command){

        // ==================== MENU ====================
        case 'menu':
        case 'help':
        case 'start':{
          await react('🤖');
          const menuText=`╭─「 🤖 *ʀᴜᴍɪ-ɪɪ* 」─➤\n│\n│ 👤 *Owner:* ${config.OWNER_NAME}\n│ ✒️ *Prefix:* ${prefix}\n│ 🧬 *Version:* ${config.BOT_VERSION}\n│ ⏰ *Uptime:* ${uptime()}\n│ 🌍 *Country:* Zimbabwe 🇿🇼\n╰──────────●●➤\n\n╭──────────────\n│ 📋 *CATEGORIES*\n│\n│ [1] 🎵 ${prefix}music — Music Menu\n│ [2] 📥 ${prefix}download — Downloads\n│ [3] 🤖 ${prefix}aimenu — AI & Chat\n│ [4] 🔧 ${prefix}tools — Tools\n│ [5] 🎮 ${prefix}fun — Fun & Games\n│ [6] ℹ️ ${prefix}info — Info & Search\n│ [7] 👥 ${prefix}group — Group Tools\n│ [8] ⚙️ ${prefix}settings — Settings\n│ [9] 👑 ${prefix}owner — Owner Info\n│ [10] 📢 ${prefix}support — Support\n╰──────────────\n\n> *ʀᴜᴍɪ-ɪɪ ʙʏ ɢʟᴀᴅᴅʏᴋɪɴɢ*`;
          await socket.sendMessage(sender,{image:{url:config.IMAGE_PATH},caption:menuText,footer:'> ʀᴜᴍɪ-ɪɪ | ɢʟᴀᴅᴅʏᴋɪɴɢ',buttons:[
            {buttonId:`${prefix}music`,buttonText:{displayText:'🎵 Music'},type:1},
            {buttonId:`${prefix}download`,buttonText:{displayText:'📥 Downloads'},type:1},
            {buttonId:`${prefix}aimenu`,buttonText:{displayText:'🤖 AI'},type:1},
            {buttonId:`${prefix}fun`,buttonText:{displayText:'🎮 Fun'},type:1},
            {buttonId:`${prefix}alive`,buttonText:{displayText:'⏰ Alive'},type:1},
          ],headerType:4},{quoted:fakevcard});
          break;
        }

        // ==================== ALIVE ====================
        case 'alive':
        case 'status':
        case 'bot':{
          await react('🚀');
          const aliveText=`*🤖 ʀᴜᴍɪ-ɪɪ ɪs ᴀʟɪᴠᴇ!*\n\n╭─「 📊 *Bot Status* 」─➤\n│ 🥷 *Owner:* ${config.OWNER_NAME}\n│ ✒️ *Prefix:* ${prefix}\n│ 🧬 *Version:* ${config.BOT_VERSION}\n│ 🎈 *Platform:* ${process.env.PLATFORM||'Heroku'}\n│ 📟 *Uptime:* ${uptime()}\n│ 🕒 *Time:* ${getTimestamp()}\n╰──────────●●➤\n\n> *ʀᴜᴍɪ-ɪɪ ʙʏ ɢʟᴀᴅᴅʏᴋɪɴɢ*`;
          await replyImgBtn(config.IMAGE_PATH,aliveText,[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
            {buttonId:`${prefix}ping`,buttonText:{displayText:'📡 Ping'},type:1},
            {buttonId:`${prefix}owner`,buttonText:{displayText:'👑 Owner'},type:1},
          ]);
          break;
        }

        // ==================== PING ====================
        case 'ping':
        case 'speed':{
          await react('📡');
          const lat=Date.now()-(msg.messageTimestamp*1000||Date.now());
          await replyImgBtn(config.IMAGE_PATH,`*📡 ʀᴜᴍɪ-ɪɪ ᴘɪɴɢ*\n\n*🛠️ Latency:* ${lat}ms\n*🕢 Server Time:* ${getTimestamp()}\n*⚡ Status:* Online ✅\n\n> *ʀᴜᴍɪ-ɪɪ*`,[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
            {buttonId:`${prefix}alive`,buttonText:{displayText:'⏰ Alive'},type:1},
          ]);
          break;
        }

        // ==================== OWNER ====================
        case 'owner':
        case 'creator':
        case 'developer':{
          await react('👑');
          await replyBtn(`*👑 ᴏᴡɴᴇʀ ɪɴғᴏ*\n\n╭─ 🧑‍💼 *DETAILS*\n│\n│ ✦ *Name:* GladdyKing\n│ ✦ *Number:* +263775953409\n│ ✦ *Bot:* RUMI-II\n│ ✦ *Version:* ${config.BOT_VERSION}\n│ ✦ *GitHub:* github.com/GladdyKing\n│\n╰────────✧\n\n> *ʀᴜᴍɪ-ɪɪ ʙʏ ɢʟᴀᴅᴅʏᴋɪɴɢ*`,[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
            {buttonId:`${prefix}support`,buttonText:{displayText:'📢 Support'},type:1},
          ]);
          break;
        }

        // ==================== MUSIC MENU ====================
        case 'music':
        case 'musicmenu':{
          await react('🎵');
          await replyBtn(`\`🎵 ᴍᴜsɪᴄ ᴍᴇɴᴜ 🎵\`\n\n╭─ 🎵 *AUDIO*\n│ ✦ ${prefix}play [name/url]\n│ ✦ ${prefix}song [name]\n│ ✦ ${prefix}ytmp3 [url]\n│ ✦ ${prefix}ytaudio [url]\n│ ✦ ${prefix}spotify [name]\n│ ✦ ${prefix}lyrics [name]\n╰──────\n\n╭─ 🎬 *VIDEO*\n│ ✦ ${prefix}video [name/url]\n│ ✦ ${prefix}ytmp4 [url]\n│ ✦ ${prefix}ytvideo [url]\n╰──────\n\n╭─ 🔍 *SEARCH*\n│ ✦ ${prefix}yts [query]\n╰──────`,[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
            {buttonId:`${prefix}download`,buttonText:{displayText:'📥 Downloads'},type:1},
          ],'🎵 RUMI-II Music');
          break;
        }

        // ==================== PLAY ====================
        case 'play':
        case 'song':
        case 'mp3':{
          await react('🎵');
          const yts=require('yt-search');
          if(!q){await replyBtn(`*🎵 Usage:* ${prefix}play <song name or YouTube URL>`,[{buttonId:`${prefix}music`,buttonText:{displayText:'🎵 Music Menu'},type:1}]);break;}
          await reply('*⏳ Searching...*');
          const search=await yts(q);
          if(!search?.videos?.length){await reply('❌ No results found!');break;}
          const vid=search.videos[0];
          const apiRes=await axios.get(`https://api.vreden.my.id/api/v1/download/play/audio?query=${encodeURIComponent(vid.url)}`,{timeout:60000});
          if(!apiRes?.data?.result?.download){await reply('❌ API failed! Try again.');break;}
          const dlUrl=apiRes.data.result.download;
          const songTitle=apiRes.data.result.title||vid.title;
          await socket.sendMessage(sender,{
            image:{url:vid.thumbnail},
            caption:`*🎧 SONG FOUND!*\n\n*🎵 Title:* ${songTitle}\n*⏱ Duration:* ${vid.timestamp}\n*👀 Views:* ${(vid.views||0).toLocaleString()}\n*📅 Uploaded:* ${vid.ago||'N/A'}\n\n*👇 Choose your format:*`,
            footer:'> ʀᴜᴍɪ-ɪɪ | ᴍᴜsɪᴄ',
            buttons:[
              {buttonId:`play_audio|${dlUrl}|${songTitle}`,buttonText:{displayText:'🎧 Send as Audio'},type:1},
              {buttonId:`play_doc|${dlUrl}|${songTitle}`,buttonText:{displayText:'📄 Send as Document'},type:1},
            ],headerType:4
          },{quoted:fakevcard});
          break;
        }

        // ==================== PLAY BUTTON CALLBACKS ====================
        case 'play_audio':
        case 'play_doc':{
          const parts=body.split('|');
          const mode=parts[0];
          const url=parts[1];
          const songTitle2=parts.slice(2).join('|');
          await react('📥');
          await reply('*⏳ Sending file...*');
          if(mode==='play_audio'){await socket.sendMessage(sender,{audio:{url},mimetype:'audio/mpeg',ptt:false},{quoted:fakevcard});}
          else{await socket.sendMessage(sender,{document:{url},mimetype:'audio/mpeg',fileName:`${songTitle2||'song'}.mp3`},{quoted:fakevcard});}
          await reply('✅ *Download complete!* 🎶');
          break;
        }

        // ==================== YOUTUBE MP3 ====================
        case 'ytmp3':
        case 'ytaudio':{
          await react('🎵');
          if(!q){await reply(`*🎵 Usage:* ${prefix}ytmp3 <YouTube URL>`);break;}
          await reply('*⏳ Downloading audio...*');
          const r3=await axios.get(`https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(q)}`,{timeout:60000});
          if(!r3?.data?.result?.download){await reply('❌ Download failed!');break;}
          await socket.sendMessage(sender,{audio:{url:r3.data.result.download},mimetype:'audio/mpeg',ptt:false},{quoted:fakevcard});
          await replyBtn(`✅ *${r3.data.result.title||'Audio'} sent!*\n\n> *ʀᴜᴍɪ-ɪɪ*`,[{buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1}]);
          break;
        }

        // ==================== VIDEO ====================
        case 'video':
        case 'ytmp4':
        case 'ytvideo':{
          await react('🎬');
          const yts2=require('yt-search');
          if(!q){await reply(`*🎬 Usage:* ${prefix}video <title or YouTube URL>`);break;}
          await reply('*⏳ Searching & downloading...*');
          let vidUrl,vidTitle,vidThumb,vidDur;
          if(q.includes('youtube.com')||q.includes('youtu.be')){
            const r4=await axios.get(`https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(q)}`,{timeout:60000});
            vidUrl=r4?.data?.result?.download; vidTitle=r4?.data?.result?.title||'Video';
            vidThumb=r4?.data?.result?.thumbnail||config.IMAGE_PATH; vidDur=r4?.data?.result?.duration||'';
          }else{
            const s2=await yts2(q);
            if(!s2?.videos?.length){await reply('❌ No results found!');break;}
            const v2=s2.videos[0];
            const r4=await axios.get(`https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(v2.url)}`,{timeout:60000});
            vidUrl=r4?.data?.result?.download; vidTitle=r4?.data?.result?.title||v2.title;
            vidThumb=v2.thumbnail||config.IMAGE_PATH; vidDur=v2.timestamp||'';
          }
          if(!vidUrl){await reply('❌ Failed to fetch video!');break;}
          await socket.sendMessage(sender,{video:{url:vidUrl},caption:`*🎬 ${vidTitle}*\n*⏱ Duration:* ${vidDur}\n\n> *ʀᴜᴍɪ-ɪɪ*`,footer:'> ʀᴜᴍɪ-ɪɪ | ᴠɪᴅᴇᴏ',buttons:[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
            {buttonId:`${prefix}video`,buttonText:{displayText:'🔄 Another'},type:1},
          ]},{quoted:fakevcard});
          break;
        }

        // ==================== YOUTUBE SEARCH ====================
        case 'yts':
        case 'ytsearch':{
          await react('🔍');
          const yts3=require('yt-search');
          if(!q){await reply(`*🔍 Usage:* ${prefix}yts <search query>`);break;}
          await reply('*⏳ Searching YouTube...*');
          const ytSearch=await yts3(q);
          if(!ytSearch?.videos?.length){await reply('❌ No results found!');break;}
          let ytText=`*🔍 YouTube Search — ${q}*\n\n`;
          ytSearch.videos.slice(0,5).forEach((v,i)=>{ytText+=`*${i+1}.* ${v.title}\n   ⏱ ${v.timestamp} | 👀 ${(v.views||0).toLocaleString()}\n   🔗 ${v.url}\n\n`;});
          ytText+=`> *ʀᴜᴍɪ-ɪɪ*`;
          await replyBtn(ytText,[{buttonId:`${prefix}play`,buttonText:{displayText:'🎵 Download Song'},type:1},{buttonId:`${prefix}video`,buttonText:{displayText:'🎬 Download Video'},type:1}]);
          break;
        }

        // ==================== TIKTOK ====================
        case 'tiktok':
        case 'tt':
        case 'ttdl':{
          await react('🎵');
          if(!q||!q.includes('tiktok.com')){await replyBtn(`*🚫 Provide a valid TikTok URL!*\n\nUsage: ${prefix}tiktok <url>`,[{buttonId:`${prefix}download`,buttonText:{displayText:'📥 DL Menu'},type:1}]);break;}
          await reply('*⏳ Downloading TikTok...*');
          const ttRes=await axios.get(`https://delirius-apiofc.vercel.app/download/tiktok?url=${encodeURIComponent(q)}`);
          if(!ttRes?.data?.status||!ttRes?.data?.data){await reply('❌ Failed to download TikTok!');break;}
          const{title:ttTitle,like,comment,share,author,meta}=ttRes.data.data;
          const ttVidUrl=meta.media.find(v=>v.type==='video')?.org;
          await socket.sendMessage(sender,{video:{url:ttVidUrl},caption:`*🎵 TIKTOK DOWNLOAD*\n\n*👤 User:* ${author?.nickname||''} (@${author?.username||''})\n*📖 Title:* ${ttTitle||''}\n*👍 Likes:* ${like||0}\n*💬 Comments:* ${comment||0}\n*🔁 Shares:* ${share||0}\n\n> *ʀᴜᴍɪ-ɪɪ*`,footer:'> ʀᴜᴍɪ-ɪɪ | ᴛɪᴋᴛᴏᴋ',buttons:[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
            {buttonId:`${prefix}tiktok`,buttonText:{displayText:'🔄 Another TikTok'},type:1},
          ]},{quoted:fakevcard});
          break;
        }

        // ==================== INSTAGRAM ====================
        case 'ig':
        case 'instagram':
        case 'igdl':{
          await react('📷');
          if(!q||!q.includes('instagram.com')){await reply(`*📷 Usage:* ${prefix}ig <Instagram URL>`);break;}
          await reply('*⏳ Downloading Instagram...*');
          const igRes=await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(q)}`);
          if(!igRes?.data?.data?.length){await reply('❌ Failed!');break;}
          const igUrl=igRes.data.data[0]?.url;
          await socket.sendMessage(sender,{video:{url:igUrl},caption:`*📷 INSTAGRAM DOWNLOAD*\n\n> *ʀᴜᴍɪ-ɪɪ*`},{quoted:fakevcard});
          break;
        }

        // ==================== FACEBOOK ====================
        case 'fb':
        case 'facebook':
        case 'fbdl':{
          await react('📘');
          if(!q||!q.includes('facebook.com')){await reply(`*📘 Usage:* ${prefix}fb <Facebook Video URL>`);break;}
          await reply('*⏳ Downloading...*');
          const fbRes=await axios.get(`https://api.siputzx.my.id/api/d/fb?url=${encodeURIComponent(q)}`);
          const fbUrl=fbRes?.data?.data?.hd||fbRes?.data?.data?.sd;
          if(!fbUrl){await reply('❌ Failed!');break;}
          await socket.sendMessage(sender,{video:{url:fbUrl},caption:`*📘 FACEBOOK DOWNLOAD*\n\n> *ʀᴜᴍɪ-ɪɪ*`},{quoted:fakevcard});
          break;
        }

        // ==================== TWITTER/X ====================
        case 'twitter':
        case 'tw':
        case 'xdl':{
          await react('🐦');
          if(!q||(!q.includes('twitter.com')&&!q.includes('x.com'))){await reply(`*🐦 Usage:* ${prefix}tw <Tweet URL>`);break;}
          await reply('*⏳ Downloading...*');
          const twRes=await axios.get(`https://api.siputzx.my.id/api/d/twitter?url=${encodeURIComponent(q)}`);
          const twUrl=twRes?.data?.data?.video?.url||twRes?.data?.data?.[0]?.url;
          if(!twUrl){await reply('❌ Failed!');break;}
          await socket.sendMessage(sender,{video:{url:twUrl},caption:`*🐦 TWITTER/X DOWNLOAD*\n\n> *ʀᴜᴍɪ-ɪɪ*`},{quoted:fakevcard});
          break;
        }

        // ==================== SPOTIFY ====================
        case 'spotify':
        case 'sptfy':{
          await react('🎵');
          if(!q){await reply(`*🎵 Usage:* ${prefix}spotify <song name>`);break;}
          await reply('*⏳ Searching Spotify...*');
          const spRes=await axios.get(`https://api.siputzx.my.id/api/s/spotify?query=${encodeURIComponent(q)}`);
          if(!spRes?.data?.data?.length){await reply('❌ No results!');break;}
          const sp=spRes.data.data[0];
          const dur=sp.duration?`${Math.floor(sp.duration/60000)}:${String(Math.floor((sp.duration%60000)/1000)).padStart(2,'0')}`:'N/A';
          await replyBtn(`*🎵 SPOTIFY*\n\n*Title:* ${sp.name}\n*Artist:* ${sp.artist}\n*Duration:* ${dur}\n*Album:* ${sp.album||'N/A'}\n\n> *ʀᴜᴍɪ-ɪɪ*`,[
            {buttonId:`${prefix}play ${sp.name} ${sp.artist}`,buttonText:{displayText:'🎧 Download'},type:1},
          ]);
          break;
        }

        // ==================== LYRICS ====================
        case 'lyrics':
        case 'lyric':{
          await react('🎶');
          if(!q){await reply(`*🎶 Usage:* ${prefix}lyrics <song name>`);break;}
          await reply('*⏳ Searching lyrics...*');
          const lRes=await axios.get(`https://some-random-api.com/lyrics?title=${encodeURIComponent(q)}`);
          if(!lRes?.data?.lyrics){await reply('❌ Lyrics not found!');break;}
          const lText=`*🎵 ${lRes.data.title||q}*\n*👤 Artist:* ${lRes.data.author||'Unknown'}\n\n${lRes.data.lyrics.substring(0,1500)}${lRes.data.lyrics.length>1500?'...':''}\n\n> *ʀᴜᴍɪ-ɪɪ*`;
          await reply(lText);
          break;
        }

        // ==================== MEDIAFIRE ====================
        case 'mediafire':
        case 'mf':
        case 'mfdl':{
          await react('📥');
          if(!q){await reply(`*📥 Usage:* ${prefix}mediafire <MediaFire URL>`);break;}
          await reply('*⏳ Fetching file...*');
          const mfRes=await axios.get(`https://tharuzz-ofc-apis.vercel.app/api/download/mediafire?url=${encodeURIComponent(q)}`);
          if(!mfRes?.data?.success){await reply('❌ Failed!');break;}
          const mf=mfRes.data.result;
          await socket.sendMessage(sender,{document:{url:mf.url},fileName:mf.filename,mimetype:'application/octet-stream',caption:`*📦 FILE*\n\n*📁 Name:* ${mf.filename}\n*📏 Size:* ${mf.size}\n\n> *ʀᴜᴍɪ-ɪɪ*`},{quoted:fakevcard});
          break;
        }

        // ==================== APK SEARCH ====================
        case 'apk':
        case 'apksearch':{
          await react('📱');
          if(!q){await reply(`*📱 Usage:* ${prefix}apk <app name>`);break;}
          await reply('*⏳ Searching APKs...*');
          const apkRes=await axios.get(`https://tharuzz-ofc-apis.vercel.app/api/search/apksearch?query=${encodeURIComponent(q)}`);
          if(!apkRes?.data?.success||!apkRes?.data?.result?.length){await reply('❌ No APKs found!');break;}
          let apkText=`*📱 APK Search: ${q}*\n\n`;
          apkRes.data.result.slice(0,10).forEach((item,idx)=>{apkText+=`*${idx+1}.* ${item.name}\n📦 ID: \`${item.id}\`\n\n`;});
          apkText+=`> *ʀᴜᴍɪ-ɪɪ*`;
          await replyBtn(apkText,[{buttonId:`${prefix}download`,buttonText:{displayText:'📥 DL Menu'},type:1}]);
          break;
        }

        // ==================== DOWNLOAD MENU ====================
        case 'download':
        case 'dlmenu':{
          await react('📥');
          await replyBtn(`\`📥 ᴅᴏᴡɴʟᴏᴀᴅ ᴍᴇɴᴜ 📥\`\n\n╭─ 🎵 *AUDIO*\n│ ✦ ${prefix}play [song]\n│ ✦ ${prefix}ytmp3 [url]\n│ ✦ ${prefix}spotify [song]\n╰──────\n\n╭─ 🎬 *VIDEO*\n│ ✦ ${prefix}video [search]\n│ ✦ ${prefix}ytmp4 [url]\n│ ✦ ${prefix}tiktok [url]\n│ ✦ ${prefix}instagram [url]\n│ ✦ ${prefix}facebook [url]\n│ ✦ ${prefix}twitter [url]\n╰──────\n\n╭─ 📁 *FILES*\n│ ✦ ${prefix}mediafire [url]\n│ ✦ ${prefix}apk [app name]\n╰──────`,[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
            {buttonId:`${prefix}music`,buttonText:{displayText:'🎵 Music'},type:1},
          ],'📥 RUMI-II Downloads');
          break;
        }

        // ==================== AI MENU ====================
        case 'aimenu':{
          await react('🤖');
          await replyBtn(`\`🤖 ᴀɪ ᴍᴇɴᴜ 🤖\`\n\n╭─ 💬 *CHAT AI*\n│ ✦ ${prefix}ai [question]\n│ ✦ ${prefix}gpt [question]\n│ ✦ ${prefix}gemini [question]\n╰──────\n\n╭─ 🎨 *IMAGE AI*\n│ ✦ ${prefix}imagine [prompt]\n│ ✦ ${prefix}aiimg [prompt]\n╰──────\n\n╭─ 🛠️ *TEXT TOOLS*\n│ ✦ ${prefix}translate [lang]|[text]\n│ ✦ ${prefix}font [text]\n│ ✦ ${prefix}mock [text]\n│ ✦ ${prefix}reverse [text]\n╰──────`,[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
          ],'🤖 RUMI-II AI');
          break;
        }

        // ==================== AI CHAT ====================
        case 'ai':
        case 'chat':
        case 'gpt':
        case 'ask':{
          await react('🤖');
          if(!q){await reply(`*🤖 Usage:* ${prefix}ai <your question>`);break;}
          await reply('*🤖 AI thinking...*');
          const aiRes=await axios.get(`https://api.malvin.gleeze.com/ai/openai?text=${encodeURIComponent(q)}`,{timeout:30000});
          const aiReply=aiRes?.data?.result||aiRes?.data?.response||aiRes?.data?.reply||aiRes?.data?.text;
          if(!aiReply){await reply('❌ AI failed to respond.');break;}
          await replyBtn(`*🤖 RUMI-II AI*\n\n*You:* ${q}\n\n*AI:*\n${aiReply}\n\n> *ʀᴜᴍɪ-ɪɪ*`,[
            {buttonId:`${prefix}ai`,buttonText:{displayText:'🤖 Ask More'},type:1},
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
          ]);
          break;
        }

        // ==================== GEMINI ====================
        case 'gemini':
        case 'bard':{
          await react('✨');
          if(!q){await reply(`*✨ Usage:* ${prefix}gemini <question>`);break;}
          await reply('*✨ Gemini thinking...*');
          const gemRes=await axios.get(`https://api.siputzx.my.id/api/ai/gemini-pro?content=${encodeURIComponent(q)}`,{timeout:30000});
          const gemReply=gemRes?.data?.data||gemRes?.data?.result;
          if(!gemReply){await reply('❌ Gemini failed.');break;}
          await reply(`*✨ GEMINI AI*\n\n${gemReply}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== AI IMAGE ====================
        case 'imagine':
        case 'aiimg':
        case 'generate':{
          await react('🎨');
          if(!q){await reply(`*🎨 Usage:* ${prefix}imagine <description>`);break;}
          await reply('*🎨 Generating image...*');
          const imgRes=await axios.get(`https://api.malvin.gleeze.com/ai/imagine?prompt=${encodeURIComponent(q)}`,{timeout:60000,responseType:'arraybuffer'});
          if(!imgRes?.data){await reply('❌ Image generation failed!');break;}
          await socket.sendMessage(sender,{image:Buffer.from(imgRes.data),caption:`*🎨 AI Generated Image*\n*Prompt:* ${q}\n\n> *ʀᴜᴍɪ-ɪɪ*`},{quoted:fakevcard});
          break;
        }

        // ==================== WEATHER ====================
        case 'weather':{
          await react('🌤️');
          if(!q){await reply(`*🌤️ Usage:* ${prefix}weather <city>`);break;}
          const wxRes=await axios.get(`https://api.siputzx.my.id/api/s/weather?q=${encodeURIComponent(q)}`);
          if(!wxRes?.data?.data){await reply('❌ City not found!');break;}
          const wx=wxRes.data.data;
          await replyBtn(`*🌤️ WEATHER — ${wx.name||q}*\n\n*🌡️ Temp:* ${wx.temp}°C\n*🌥️ Condition:* ${wx.condition}\n*💧 Humidity:* ${wx.humidity}%\n*💨 Wind:* ${wx.wind}\n\n> *ʀᴜᴍɪ-ɪɪ*`,[{buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1}]);
          break;
        }

        // ==================== NEWS ====================
        case 'news':
        case 'headlines':{
          await react('📰');
          await reply('*⏳ Fetching news...*');
          const newsRes=await axios.get('https://api.siputzx.my.id/api/s/news');
          if(!newsRes?.data?.data?.length){await reply('❌ Could not fetch news!');break;}
          let newsText=`*📰 LATEST NEWS*\n\n`;
          newsRes.data.data.slice(0,5).forEach((item,i)=>{newsText+=`*${i+1}.* ${item.title}\n🔗 ${item.link||''}\n\n`;});
          newsText+=`> *ʀᴜᴍɪ-ɪɪ*`;
          await reply(newsText);
          break;
        }

        // ==================== WIKIPEDIA ====================
        case 'wiki':
        case 'wikipedia':{
          await react('📚');
          if(!q){await reply(`*📚 Usage:* ${prefix}wiki <topic>`);break;}
          await reply('*⏳ Searching...*');
          const wikiRes=await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`);
          if(!wikiRes?.data?.extract){await reply('❌ Not found!');break;}
          await replyBtn(`*📚 WIKIPEDIA — ${wikiRes.data.title}*\n\n${wikiRes.data.extract.substring(0,800)}${wikiRes.data.extract.length>800?'...':''}\n\n🔗 ${wikiRes.data.content_urls?.desktop?.page||''}\n\n> *ʀᴜᴍɪ-ɪɪ*`,[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
          ]);
          break;
        }

        // ==================== DICTIONARY ====================
        case 'define':
        case 'dict':
        case 'meaning':{
          await react('📖');
          if(!q){await reply(`*📖 Usage:* ${prefix}define <word>`);break;}
          const dictRes=await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q)}`);
          if(!dictRes?.data?.[0]){await reply('❌ Word not found!');break;}
          const word=dictRes.data[0];
          const def=word.meanings?.[0]?.definitions?.[0];
          await reply(`*📖 DICTIONARY — ${word.word}*\n\n*Part of Speech:* ${word.meanings?.[0]?.partOfSpeech||'N/A'}\n*Definition:* ${def?.definition||'N/A'}\n*Example:* ${def?.example||'N/A'}\n*Phonetic:* ${word.phonetic||'N/A'}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== TRANSLATE ====================
        case 'translate':
        case 'tr':{
          await react('🌐');
          if(!q||!q.includes('|')){await reply(`*🌐 Usage:* ${prefix}tr <lang> | <text>\nExample: ${prefix}tr es | Hello World`);break;}
          const parts3=q.split('|');
          const lang=parts3[0].trim();
          const text2=parts3.slice(1).join('|').trim();
          await reply('*⏳ Translating...*');
          const trRes=await axios.get(`https://api.siputzx.my.id/api/tools/translate?text=${encodeURIComponent(text2)}&to=${encodeURIComponent(lang)}`);
          if(!trRes?.data?.result){await reply('❌ Translation failed!');break;}
          await reply(`*🌐 TRANSLATION*\n\n*Original:* ${text2}\n*Language:* ${lang}\n*Translated:* ${trRes.data.result}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== CURRENCY ====================
        case 'currency':
        case 'exchange':{
          await react('💱');
          if(!q||args.length<3){await reply(`*💱 Usage:* ${prefix}currency <amount> <FROM> <TO>\nExample: ${prefix}currency 100 USD ZAR`);break;}
          const[amt,from2,to2]=args;
          const cRes=await axios.get(`https://api.exchangerate-api.com/v4/latest/${from2.toUpperCase()}`);
          if(!cRes?.data?.rates?.[to2.toUpperCase()]){await reply('❌ Currency not found!');break;}
          const rate=cRes.data.rates[to2.toUpperCase()];
          const conv=(parseFloat(amt)*rate).toFixed(2);
          await reply(`*💱 CURRENCY CONVERTER*\n\n*${amt} ${from2.toUpperCase()} = ${conv} ${to2.toUpperCase()}*\n*Rate:* 1 ${from2.toUpperCase()} = ${rate} ${to2.toUpperCase()}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== CALCULATOR ====================
        case 'calc':
        case 'calculate':
        case 'math':{
          await react('🧮');
          if(!q){await reply(`*🧮 Usage:* ${prefix}calc <expression>\nExample: ${prefix}calc 2+2*5`);break;}
          try{const r5=eval(q.replace(/[^0-9+\-*/().\s]/g,''));await reply(`*🧮 CALCULATOR*\n\n*Expression:* ${q}\n*Result:* ${r5}\n\n> *ʀᴜᴍɪ-ɪɪ*`);}
          catch(e){await reply('❌ Invalid expression!');}
          break;
        }

        // ==================== QR CODE ====================
        case 'qr':
        case 'qrcode':{
          await react('📷');
          if(!q){await reply(`*📷 Usage:* ${prefix}qr <text or URL>`);break;}
          await socket.sendMessage(sender,{image:{url:`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(q)}`},caption:`*📷 QR CODE*\n*Data:* ${q}\n\n> *ʀᴜᴍɪ-ɪɪ*`},{quoted:fakevcard});
          break;
        }

        // ==================== SHORT URL ====================
        case 'shorturl':
        case 'shorten':
        case 'short':{
          await react('🔗');
          if(!q||!q.startsWith('http')){await reply(`*🔗 Usage:* ${prefix}short <URL>`);break;}
          const sRes=await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(q)}`);
          await reply(`*🔗 URL SHORTENED*\n\n*Original:* ${q}\n*Short:* ${sRes.data}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== GITHUB ====================
        case 'github':
        case 'gh':{
          await react('👨‍💻');
          if(!q){await reply(`*👨‍💻 Usage:* ${prefix}github <username>`);break;}
          const ghRes=await axios.get(`https://api.github.com/users/${q}`);
          if(!ghRes?.data?.login){await reply('❌ User not found!');break;}
          const gh=ghRes.data;
          await socket.sendMessage(sender,{image:{url:gh.avatar_url},caption:`*👨‍💻 GITHUB — ${gh.login}*\n\n*Name:* ${gh.name||'N/A'}\n*Bio:* ${gh.bio||'N/A'}\n*Location:* ${gh.location||'N/A'}\n*Repos:* ${gh.public_repos}\n*Followers:* ${gh.followers}\n*Following:* ${gh.following}\n*Joined:* ${new Date(gh.created_at).toDateString()}\n*URL:* ${gh.html_url}\n\n> *ʀᴜᴍɪ-ɪɪ*`},{quoted:fakevcard});
          break;
        }

        // ==================== NPM ====================
        case 'npm':{
          await react('📦');
          if(!q){await reply(`*📦 Usage:* ${prefix}npm <package name>`);break;}
          const npmRes=await axios.get(`https://registry.npmjs.org/${q}`);
          if(!npmRes?.data?.name){await reply('❌ Package not found!');break;}
          const npm=npmRes.data;
          await reply(`*📦 NPM — ${npm.name}*\n\n*Version:* ${npm['dist-tags']?.latest}\n*Description:* ${npm.description||'N/A'}\n*Author:* ${npm.author?.name||'N/A'}\n*License:* ${npm.license||'N/A'}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== ANIME ====================
        case 'anime':
        case 'animesearch':{
          await react('🎌');
          if(!q){await reply(`*🎌 Usage:* ${prefix}anime <anime name>`);break;}
          await reply('*⏳ Searching anime...*');
          const animeRes=await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=1`);
          if(!animeRes?.data?.data?.length){await reply('❌ Not found!');break;}
          const a=animeRes.data.data[0];
          await socket.sendMessage(sender,{image:{url:a.images?.jpg?.image_url||config.IMAGE_PATH},caption:`*🎌 ANIME — ${a.title}*\n\n*Type:* ${a.type}\n*Episodes:* ${a.episodes||'Ongoing'}\n*Status:* ${a.status}\n*Score:* ${a.score}/10 ⭐\n*Genres:* ${a.genres?.map(g=>g.name).join(', ')||'N/A'}\n*Synopsis:* ${(a.synopsis||'').substring(0,200)}...\n\n> *ʀᴜᴍɪ-ɪɪ*`,footer:'> ʀᴜᴍɪ-ɪɪ | ᴀɴɪᴍᴇ',buttons:[{buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1}]},{quoted:fakevcard});
          break;
        }

        // ==================== WAIFU ====================
        case 'waifu':{
          await react('🎌');
          const wRes=await axios.get('https://api.waifu.pics/sfw/waifu');
          if(!wRes?.data?.url){await reply('❌ Failed!');break;}
          await socket.sendMessage(sender,{image:{url:wRes.data.url},caption:`*🎌 Your waifu!*\n\n> *ʀᴜᴍɪ-ɪɪ*`,buttons:[{buttonId:`${prefix}waifu`,buttonText:{displayText:'🔄 Another Waifu'},type:1}]},{quoted:fakevcard});
          break;
        }

        // ==================== COVID ====================
        case 'covid':
        case 'corona':{
          await react('🦠');
          const cRes2=await axios.get(`https://disease.sh/v3/covid-19/${q?`countries/${q}`:'all'}`);
          if(!cRes2?.data){await reply('❌ Could not fetch data!');break;}
          const c=cRes2.data;
          await reply(`*🦠 COVID-19 — ${c.country||'World'}*\n\n*🔴 Total Cases:* ${c.cases?.toLocaleString()}\n*✅ Recovered:* ${c.recovered?.toLocaleString()}\n*💀 Deaths:* ${c.deaths?.toLocaleString()}\n*🟡 Active:* ${c.active?.toLocaleString()}\n*Today:* ${c.todayCases?.toLocaleString()}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== ZODIAC ====================
        case 'zodiac':
        case 'horoscope':{
          await react('⭐');
          if(!q){await reply(`*⭐ Usage:* ${prefix}zodiac <sign>\nSigns: aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagittarius, capricorn, aquarius, pisces`);break;}
          const zodRes=await axios.get(`https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${q}&day=today`);
          if(!zodRes?.data?.data){await reply('❌ Sign not found!');break;}
          await reply(`*⭐ ${q.toUpperCase()} HOROSCOPE*\n\n${zodRes.data.data.horoscope_data}\n\n*Date:* ${zodRes.data.data.date}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== MINECRAFT SERVER ====================
        case 'mcstatus':
        case 'minecraft':{
          await react('⛏️');
          if(!q){await reply(`*⛏️ Usage:* ${prefix}mcstatus <server IP>`);break;}
          const mcRes=await axios.get(`https://api.mcsrvstat.us/2/${q}`);
          if(!mcRes?.data){await reply('❌ Failed!');break;}
          const mc=mcRes.data;
          await reply(`*⛏️ MINECRAFT SERVER — ${q}*\n\n*Online:* ${mc.online?'✅ Yes':'❌ No'}\n*Players:* ${mc.players?.online||0}/${mc.players?.max||0}\n*Version:* ${mc.version||'N/A'}\n*MOTD:* ${mc.motd?.clean?.[0]||'N/A'}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== STICKER ====================
        case 'sticker':
        case 'stiker':
        case 'stic':{
          await react('🎨');
          const qMsg=msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
          if(!qMsg){await reply(`*🎨 Reply to an image/video with* ${prefix}sticker`);break;}
          const qType=Object.keys(qMsg)[0];
          if(!['imageMessage','videoMessage'].includes(qType)){await reply('❌ Reply to an image or video!');break;}
          await reply('*⏳ Creating sticker...*');
          const stream3=await downloadContentFromMessage(qMsg[qType],qType==='imageMessage'?'image':'video');
          let buf3=Buffer.from([]);
          for await(const chunk of stream3)buf3=Buffer.concat([buf3,chunk]);
          await socket.sendMessage(sender,{sticker:buf3},{quoted:msg});
          break;
        }

        // ==================== TOIMAGE ====================
        case 'toimage':
        case 'stickertoimage':{
          await react('🖼️');
          const qMsg2=msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
          if(!qMsg2?.stickerMessage){await reply(`*🖼️ Reply to a sticker with* ${prefix}toimage`);break;}
          await reply('*⏳ Converting...*');
          const stream4=await downloadContentFromMessage(qMsg2.stickerMessage,'sticker');
          let buf4=Buffer.from([]);
          for await(const chunk of stream4)buf4=Buffer.concat([buf4,chunk]);
          await socket.sendMessage(sender,{image:buf4,caption:`*🖼️ Sticker → Image*\n\n> *ʀᴜᴍɪ-ɪɪ*`},{quoted:fakevcard});
          break;
        }

        // ==================== FONT ====================
        case 'font':
        case 'fancy':{
          await react('✍️');
          if(!q){await reply(`*✍️ Usage:* ${prefix}font <text>`);break;}
          const fRes=await axios.get(`https://api.siputzx.my.id/api/tools/fancy-text?text=${encodeURIComponent(q)}`);
          if(!fRes?.data?.result){await reply('❌ Failed!');break;}
          const fonts=fRes.data.result;
          let fontText=`*✍️ FANCY FONTS — ${q}*\n\n`;
          Object.keys(fonts).slice(0,10).forEach(k=>{fontText+=`${fonts[k]}\n`;});
          fontText+=`\n> *ʀᴜᴍɪ-ɪɪ*`;
          await reply(fontText);
          break;
        }

        // ==================== MOCK ====================
        case 'mock':
        case 'spongebob':{
          await react('😏');
          if(!q){await reply(`*Usage:* ${prefix}mock <text>`);break;}
          const mocked=q.split('').map((c,i)=>i%2===0?c.toLowerCase():c.toUpperCase()).join('');
          await reply(`*😏 MOCKED*\n\n${mocked}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== REVERSE ====================
        case 'reverse':{
          await react('🔄');
          if(!q){await reply(`*Usage:* ${prefix}reverse <text>`);break;}
          await reply(`*🔄 REVERSED*\n\n${q.split('').reverse().join('')}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== JOKE ====================
        case 'joke':
        case 'jokes':{
          await react('😂');
          const jRes=await axios.get('https://official-joke-api.appspot.com/random_joke');
          await reply(`*😂 JOKE*\n\n*Setup:* ${jRes.data.setup}\n*Punchline:* ${jRes.data.punchline}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== QUOTE ====================
        case 'quote':
        case 'quotes':{
          await react('💬');
          const qRes=await axios.get('https://api.quotable.io/random');
          await reply(`*💬 QUOTE*\n\n"${qRes.data.content}"\n\n— *${qRes.data.author}*\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== FACT ====================
        case 'fact':
        case 'facts':{
          await react('🧠');
          const factRes=await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random');
          await reply(`*🧠 RANDOM FACT*\n\n${factRes.data.text}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== TRIVIA ====================
        case 'trivia':
        case 'quiz':{
          await react('🎯');
          const tRes=await axios.get('https://opentdb.com/api.php?amount=1&type=multiple');
          if(!tRes?.data?.results?.[0]){await reply('❌ Could not fetch trivia!');break;}
          const trivia=tRes.data.results[0];
          const allAns=[trivia.correct_answer,...trivia.incorrect_answers].sort(()=>Math.random()-0.5);
          let triviaText=`*🎯 TRIVIA!*\n\n*Category:* ${trivia.category}\n*Difficulty:* ${trivia.difficulty}\n\n*Q:* ${trivia.question.replace(/&quot;/g,'"').replace(/&#039;/g,"'")}\n\n`;
          allAns.forEach((a,i)=>{triviaText+=`*${String.fromCharCode(65+i)}.* ${a.replace(/&quot;/g,'"')}\n`;});
          triviaText+=`\n_Type your letter answer_\n\n> *ʀᴜᴍɪ-ɪɪ*`;
          await reply(triviaText);
          break;
        }

        // ==================== MEME ====================
        case 'meme':{
          await react('😄');
          const mRes=await axios.get('https://meme-api.com/gimme');
          if(!mRes?.data?.url){await reply('❌ Failed!');break;}
          await socket.sendMessage(sender,{image:{url:mRes.data.url},caption:`*😄 ${mRes.data.title||'MEME'}*\n\n⬆️ ${mRes.data.ups||0} | 💬 ${mRes.data.num_comments||0}\n\n> *ʀᴜᴍɪ-ɪɪ*`,footer:'> ʀᴜᴍɪ-ɪɪ | ᴍᴇᴍᴇ',buttons:[{buttonId:`${prefix}meme`,buttonText:{displayText:'😄 Another Meme'},type:1}]},{quoted:fakevcard});
          break;
        }

        // ==================== CAT ====================
        case 'cat':{
          await react('🐱');
          const catRes=await axios.get('https://api.thecatapi.com/v1/images/search');
          if(!catRes?.data?.[0]?.url){await reply('❌ Failed!');break;}
          await socket.sendMessage(sender,{image:{url:catRes.data[0].url},caption:`*🐱 Here's your cat!*\n\n> *ʀᴜᴍɪ-ɪɪ*`,buttons:[{buttonId:`${prefix}cat`,buttonText:{displayText:'🐱 Another Cat'},type:1}]},{quoted:fakevcard});
          break;
        }

        // ==================== DOG ====================
        case 'dog':{
          await react('🐶');
          const dogRes=await axios.get('https://dog.ceo/api/breeds/image/random');
          if(!dogRes?.data?.message){await reply('❌ Failed!');break;}
          await socket.sendMessage(sender,{image:{url:dogRes.data.message},caption:`*🐶 Here's your dog!*\n\n> *ʀᴜᴍɪ-ɪɪ*`,buttons:[{buttonId:`${prefix}dog`,buttonText:{displayText:'🐶 Another Dog'},type:1}]},{quoted:fakevcard});
          break;
        }

        // ==================== TRUTH ====================
        case 'truth':{
          await react('🙈');
          const truthRes=await axios.get('https://api.truthordarebot.xyz/v1/truth');
          if(!truthRes?.data?.question){await reply('❌ Failed!');break;}
          await replyBtn(`*🙈 TRUTH*\n\n${truthRes.data.question}\n\n> *ʀᴜᴍɪ-ɪɪ*`,[
            {buttonId:`${prefix}truth`,buttonText:{displayText:'🙈 Another Truth'},type:1},
            {buttonId:`${prefix}dare`,buttonText:{displayText:'🔥 Dare Instead'},type:1},
          ]);
          break;
        }

        // ==================== DARE ====================
        case 'dare':{
          await react('🔥');
          const dareRes=await axios.get('https://api.truthordarebot.xyz/v1/dare');
          if(!dareRes?.data?.question){await reply('❌ Failed!');break;}
          await replyBtn(`*🔥 DARE*\n\n${dareRes.data.question}\n\n> *ʀᴜᴍɪ-ɪɪ*`,[
            {buttonId:`${prefix}dare`,buttonText:{displayText:'🔥 Another Dare'},type:1},
            {buttonId:`${prefix}truth`,buttonText:{displayText:'🙈 Truth Instead'},type:1},
          ]);
          break;
        }

        // ==================== WYR ====================
        case 'wyr':
        case 'wouldyourather':{
          await react('🤔');
          const wyrRes=await axios.get('https://api.truthordarebot.xyz/v1/wyr');
          if(!wyrRes?.data?.question){await reply('❌ Failed!');break;}
          await replyBtn(`*🤔 WOULD YOU RATHER?*\n\n${wyrRes.data.question}\n\n> *ʀᴜᴍɪ-ɪɪ*`,[
            {buttonId:`${prefix}wyr`,buttonText:{displayText:'🤔 Another WYR'},type:1},
          ]);
          break;
        }

        // ==================== 8BALL ====================
        case '8ball':
        case 'magic8':{
          await react('🎱');
          const r8=['Yes definitely!','No way!','Ask again later.','Absolutely!','Doubtful.','Most likely!','Without a doubt!','My sources say no.','Outlook not so good.','Signs point to yes!'];
          if(!q){await reply(`*🎱 Usage:* ${prefix}8ball <question>`);break;}
          await reply(`*🎱 MAGIC 8-BALL*\n\n*Q:* ${q}\n*A:* ${randomElement(r8)}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== SHIP ====================
        case 'ship':
        case 'love':{
          await react('💘');
          if(!q||!q.includes('+')){await reply(`*💘 Usage:* ${prefix}ship name1+name2`);break;}
          const[n1,n2]=q.split('+');
          const pct=Math.floor(Math.random()*101);
          const hearts='❤️'.repeat(Math.floor(pct/10))+'🖤'.repeat(10-Math.floor(pct/10));
          await reply(`*💘 LOVE CALCULATOR*\n\n*${n1.trim()}* ❤️ *${n2.trim()}*\n\n${hearts}\n*Love Meter:* ${pct}%\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== RATE ====================
        case 'rate':{
          await react('⭐');
          const score=Math.floor(Math.random()*101);
          const stars='⭐'.repeat(Math.ceil(score/20));
          await reply(`*⭐ PROFILE RATING*\n\n${stars}\nScore: *${score}/100*\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== RANDOM ====================
        case 'random':
        case 'roll':{
          await react('🎲');
          const max=parseInt(args[0])||100;
          const min=parseInt(args[1])||1;
          const rolled=Math.floor(Math.random()*(max-min+1))+min;
          await reply(`*🎲 RANDOM NUMBER*\n\nRange: ${min} - ${max}\nResult: *${rolled}*\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== COIN FLIP ====================
        case 'flip':
        case 'coin':{
          await react('🪙');
          await reply(`*🪙 COIN FLIP*\n\nResult: *${Math.random()>0.5?'🦅 HEADS':'🦁 TAILS'}*\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== PP SIZE ====================
        case 'pp':
        case 'ppsize':{
          await react('😂');
          const sz=Math.floor(Math.random()*30)+1;
          await reply(`*😂 PP SIZE*\n\n[${'▓'.repeat(sz)}] ${sz}cm\n\n*RUMI-II said it, not me 💀*\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== HYPE ====================
        case 'hype':{
          await react('🔥');
          const hypes=['🔥 You are absolutely unstoppable!','💪 Greatness is your destiny!','⚡ You are the storm they warned about!','🌟 Champions refuse to give up!','🚀 You are built different — keep going!'];
          await reply(`*🔥 HYPE TIME!*\n\n${randomElement(hypes)}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== ROAST ====================
        case 'roast':{
          await react('😂');
          const roasts=['You\'re the human version of a participation trophy.','If you were a spice, you\'d be flour.','Light travels faster than sound — that\'s why you seemed bright until you spoke.','I\'d agree with you but then we\'d both be wrong.','You\'re not stupid. You just have bad luck thinking.'];
          await reply(`*😂 ROAST for ${q||'you'}*\n\n${randomElement(roasts)}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== COMPLIMENT ====================
        case 'compliment':
        case 'comp':{
          await react('💖');
          const comps=['You have the best laugh!','You are genuinely hilarious!','You make the world a better place.','Your kindness is a superpower.','You light up every room you enter!'];
          await reply(`*💖 COMPLIMENT for ${q||'you'}*\n\n${randomElement(comps)}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== PICK ====================
        case 'pick':
        case 'choose':{
          await react('🎯');
          if(!q||!q.includes('|')){await reply(`*🎯 Usage:* ${prefix}pick option1 | option2 | option3`);break;}
          const opts=q.split('|').map(o=>o.trim());
          if(opts.length<2){await reply('*❌ Provide at least 2 options!*');break;}
          await reply(`*🎯 DECISION MAKER*\n\n*Options:* ${opts.join(' vs ')}\n*I pick:* *${randomElement(opts)}*\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== TOSS ====================
        case 'toss':{
          await react('🎲');
          await reply(`*🎲 TOSS*\n\n*${randomElement(['Yes ✅','No ❌','Maybe 🤔','Definitely ✅','Never ❌'])}*\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== COUNTDOWN ====================
        case 'countdown':{
          await react('⏳');
          if(!q){await reply(`*⏳ Usage:* ${prefix}countdown <YYYY-MM-DD>`);break;}
          const target=new Date(q);
          if(isNaN(target)){await reply('❌ Invalid date! Use YYYY-MM-DD');break;}
          const diff=target-new Date();
          if(diff<0){await reply('❌ That date is in the past!');break;}
          const d=Math.floor(diff/(1000*60*60*24));
          const h=Math.floor((diff%(1000*60*60*24))/(1000*60*60));
          const m=Math.floor((diff%(1000*60*60))/(1000*60));
          await reply(`*⏳ COUNTDOWN to ${q}*\n\n*${d} days, ${h} hours, ${m} minutes*\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== TIME ====================
        case 'time':
        case 'timezone':{
          await react('🕐');
          const tz=q||'Africa/Harare';
          try{await reply(`*🕐 TIME IN ${tz}*\n\n${moment().tz(tz).format('YYYY-MM-DD HH:mm:ss z')}\n\n> *ʀᴜᴍɪ-ɪɪ*`);}
          catch(e){await reply('❌ Invalid timezone!');}
          break;
        }

        // ==================== PASTE ====================
        case 'paste':{
          await react('📋');
          if(!q){await reply(`*📋 Usage:* ${prefix}paste <text>`);break;}
          const pRes=await axios.post('https://hastebin.com/documents',q,{headers:{'Content-Type':'text/plain'}});
          if(!pRes?.data?.key){await reply('❌ Upload failed!');break;}
          await reply(`*📋 TEXT UPLOADED*\n\n🔗 https://hastebin.com/${pRes.data.key}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== COLOR INFO ====================
        case 'color':
        case 'hex':{
          await react('🎨');
          if(!q){await reply(`*🎨 Usage:* ${prefix}color <hex code>\nExample: ${prefix}color FF5733`);break;}
          const hex=q.replace('#','');
          const colorUrl=`https://www.thecolorapi.com/id?hex=${hex}`;
          const cRes3=await axios.get(colorUrl);
          if(!cRes3?.data?.name){await reply('❌ Invalid color!');break;}
          await socket.sendMessage(sender,{image:{url:`https://via.placeholder.com/200/${hex}/000000?text=${hex}`},caption:`*🎨 COLOR INFO*\n\n*Hex:* #${hex}\n*Name:* ${cRes3.data.name.value}\n*RGB:* ${cRes3.data.rgb.value}\n*HSL:* ${cRes3.data.hsl.value}\n\n> *ʀᴜᴍɪ-ɪɪ*`},{quoted:fakevcard});
          break;
        }

        // ==================== ASCII ART ====================
        case 'ascii':
        case 'asciify':{
          await react('🎭');
          if(!q){await reply(`*🎭 Usage:* ${prefix}ascii <text>`);break;}
          const asciiRes=await axios.get(`https://artii.herokuapp.com/make?text=${encodeURIComponent(q)}`);
          await reply(`*🎭 ASCII ART*\n\n\`\`\`\n${asciiRes.data}\n\`\`\`\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== MOTIVATION ====================
        case 'motivation':
        case 'motivate':{
          await react('💪');
          const motivations=['💪 The only way out is through!','🔥 Your breakthrough is one step away!','⚡ Believe in your unlimited potential!','🌟 Every expert was once a beginner!','🚀 Push yourself because no one else will do it for you!'];
          await reply(`*💪 MOTIVATION*\n\n${randomElement(motivations)}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== RIDDLE ====================
        case 'riddle':{
          await react('🧩');
          const riddles=[{q:'What has keys but no locks?',a:'A keyboard'},
            {q:'What gets wetter as it dries?',a:'A towel'},
            {q:'What can travel around the world while staying in a corner?',a:'A stamp'},
            {q:'I speak without a mouth and hear without ears. What am I?',a:'An echo'},
            {q:'The more you take, the more you leave behind. What am I?',a:'Footsteps'}];
          const riddle=randomElement(riddles);
          await replyBtn(`*🧩 RIDDLE*\n\n${riddle.q}\n\n_Reply to reveal answer or ask hint!_\n\n> *ʀᴜᴍɪ-ɪɪ*`,[
            {buttonId:`riddleans|${riddle.a}`,buttonText:{displayText:'💡 Show Answer'},type:1},
          ]);
          break;
        }

        // ==================== RIDDLE ANSWER ====================
        case 'riddleans':{
          const ans=body.split('|')[1]||'?';
          await reply(`*💡 ANSWER*\n\n${ans}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== TONGUE TWISTER ====================
        case 'tongue':
        case 'tonguetwister':{
          await react('👅');
          const twisters=['She sells seashells by the seashore.','How much wood would a woodchuck chuck if a woodchuck could chuck wood?','Peter Piper picked a peck of pickled peppers.','Red lorry, yellow lorry, red lorry, yellow lorry.','Six slippery snails slid slowly seaward.'];
          await reply(`*👅 TONGUE TWISTER*\n\n${randomElement(twisters)}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== DARE PACK ====================
        case 'todpack':{
          await react('🎲');
          const t2=await axios.get('https://api.truthordarebot.xyz/v1/truth');
          const d2=await axios.get('https://api.truthordarebot.xyz/v1/dare');
          await reply(`*🎲 TRUTH OR DARE PACK*\n\n*🙈 Truth:* ${t2.data.question}\n\n*🔥 Dare:* ${d2.data.question}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== TOOLS MENU ====================
        case 'tools':
        case 'toolsmenu':{
          await react('🔧');
          await replyBtn(`\`🔧 ᴛᴏᴏʟs ᴍᴇɴᴜ 🔧\`\n\n╭─ 🔢 *CALCULATORS*\n│ ✦ ${prefix}calc [expr]\n│ ✦ ${prefix}currency [amt] [from] [to]\n╰──────\n\n╭─ 🔍 *SEARCH*\n│ ✦ ${prefix}wiki [topic]\n│ ✦ ${prefix}define [word]\n│ ✦ ${prefix}github [user]\n│ ✦ ${prefix}weather [city]\n╰──────\n\n╭─ 🌐 *WEB TOOLS*\n│ ✦ ${prefix}qr [text]\n│ ✦ ${prefix}short [url]\n│ ✦ ${prefix}translate [lang]|[text]\n│ ✦ ${prefix}paste [text]\n│ ✦ ${prefix}ascii [text]\n╰──────\n\n╭─ 🖼️ *MEDIA*\n│ ✦ ${prefix}sticker\n│ ✦ ${prefix}toimage\n│ ✦ ${prefix}font [text]\n│ ✦ ${prefix}mock [text]\n│ ✦ ${prefix}reverse [text]\n│ ✦ ${prefix}color [hex]\n╰──────`,[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
          ],'🔧 RUMI-II Tools');
          break;
        }

        // ==================== FUN MENU ====================
        case 'fun':
        case 'funmenu':{
          await react('🎮');
          await replyBtn(`\`🎮 ғᴜɴ ᴍᴇɴᴜ 🎮\`\n\n╭─ 😂 *ENTERTAINMENT*\n│ ✦ ${prefix}joke\n│ ✦ ${prefix}meme\n│ ✦ ${prefix}quote\n│ ✦ ${prefix}fact\n│ ✦ ${prefix}trivia\n│ ✦ ${prefix}waifu\n│ ✦ ${prefix}cat\n│ ✦ ${prefix}dog\n│ ✦ ${prefix}riddle\n│ ✦ ${prefix}tongue\n╰──────\n\n╭─ 🎲 *GAMES*\n│ ✦ ${prefix}truth\n│ ✦ ${prefix}dare\n│ ✦ ${prefix}wyr\n│ ✦ ${prefix}8ball [q]\n│ ✦ ${prefix}ship name1+name2\n│ ✦ ${prefix}rate\n│ ✦ ${prefix}pp\n│ ✦ ${prefix}roll [max]\n│ ✦ ${prefix}coin\n│ ✦ ${prefix}pick opt1|opt2\n│ ✦ ${prefix}toss\n╰──────\n\n╭─ 💬 *SOCIAL*\n│ ✦ ${prefix}roast [name]\n│ ✦ ${prefix}compliment [name]\n│ ✦ ${prefix}hype\n│ ✦ ${prefix}motivation\n│ ✦ ${prefix}countdown [date]\n╰──────`,[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
            {buttonId:`${prefix}joke`,buttonText:{displayText:'😂 Joke'},type:1},
            {buttonId:`${prefix}meme`,buttonText:{displayText:'😄 Meme'},type:1},
          ],'🎮 RUMI-II Fun');
          break;
        }

        // ==================== INFO MENU ====================
        case 'info':
        case 'infomenu':{
          await react('ℹ️');
          await replyBtn(`\`ℹ️ ɪɴғᴏ ᴍᴇɴᴜ ℹ️\`\n\n╭─ 🌍 *GENERAL*\n│ ✦ ${prefix}weather [city]\n│ ✦ ${prefix}news\n│ ✦ ${prefix}covid [country]\n│ ✦ ${prefix}zodiac [sign]\n│ ✦ ${prefix}time [timezone]\n╰──────\n\n╭─ 🎌 *MEDIA*\n│ ✦ ${prefix}anime [name]\n│ ✦ ${prefix}lyrics [song]\n│ ✦ ${prefix}spotify [song]\n╰──────\n\n╭─ 👨‍💻 *DEV*\n│ ✦ ${prefix}github [user]\n│ ✦ ${prefix}npm [pkg]\n│ ✦ ${prefix}wiki [topic]\n│ ✦ ${prefix}define [word]\n│ ✦ ${prefix}mcstatus [ip]\n╰──────`,[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
          ],'ℹ️ RUMI-II Info');
          break;
        }

        // ==================== GROUP MENU ====================
        case 'group':
        case 'groupmenu':{
          await react('👥');
          await replyBtn(`\`👥 ɢʀᴏᴜᴘ ᴍᴇɴᴜ 👥\`\n\n╭─ 👑 *ADMIN CMDS*\n│ ✦ ${prefix}kick [@user]\n│ ✦ ${prefix}promote [@user]\n│ ✦ ${prefix}demote [@user]\n│ ✦ ${prefix}mute\n│ ✦ ${prefix}unmute\n│ ✦ ${prefix}setname [name]\n│ ✦ ${prefix}setdesc [desc]\n│ ✦ ${prefix}invite\n│ ✦ ${prefix}revoke\n╰──────\n\n╭─ 📊 *INFO CMDS*\n│ ✦ ${prefix}groupinfo\n│ ✦ ${prefix}admins\n│ ✦ ${prefix}members\n│ ✦ ${prefix}tagall [msg]\n╰──────`,[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
          ],'👥 RUMI-II Group');
          break;
        }

        // ==================== KICK ====================
        case 'kick':
        case 'remove':{
          if(!isGroup){await reply('❌ Group only!');break;}
          const mentioned=msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
          const qParticipant=msg.message?.extendedTextMessage?.contextInfo?.participant;
          const kickTarget=mentioned?.[0]||qParticipant;
          if(!kickTarget){await reply(`*Usage:* ${prefix}kick @user`);break;}
          const gmK=await socket.groupMetadata(from);
          const isAdmK=gmK.participants.find(p=>p.id===nowsender)?.admin;
          if(!isAdmK&&!isOwner){await reply('❌ Admin only!');break;}
          await socket.groupParticipantsUpdate(from,[kickTarget],'remove');
          await reply(`✅ *${kickTarget.split('@')[0]} removed!*`);
          break;
        }

        // ==================== PROMOTE ====================
        case 'promote':{
          if(!isGroup){await reply('❌ Group only!');break;}
          const mentioned2=msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
          const promoteTarget=mentioned2?.[0];
          if(!promoteTarget){await reply(`*Usage:* ${prefix}promote @user`);break;}
          const gmP=await socket.groupMetadata(from);
          const isAdmP=gmP.participants.find(p=>p.id===nowsender)?.admin;
          if(!isAdmP&&!isOwner){await reply('❌ Admin only!');break;}
          await socket.groupParticipantsUpdate(from,[promoteTarget],'promote');
          await reply(`✅ *${promoteTarget.split('@')[0]} promoted to admin!*`);
          break;
        }

        // ==================== DEMOTE ====================
        case 'demote':{
          if(!isGroup){await reply('❌ Group only!');break;}
          const mentionedD=msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
          const demoteTarget=mentionedD?.[0];
          if(!demoteTarget){await reply(`*Usage:* ${prefix}demote @user`);break;}
          const gmD=await socket.groupMetadata(from);
          const isAdmD=gmD.participants.find(p=>p.id===nowsender)?.admin;
          if(!isAdmD&&!isOwner){await reply('❌ Admin only!');break;}
          await socket.groupParticipantsUpdate(from,[demoteTarget],'demote');
          await reply(`✅ *${demoteTarget.split('@')[0]} demoted!*`);
          break;
        }

        // ==================== MUTE ====================
        case 'mute':{
          if(!isGroup){await reply('❌ Group only!');break;}
          const gmMute=await socket.groupMetadata(from);
          const isAdmMute=gmMute.participants.find(p=>p.id===nowsender)?.admin;
          if(!isAdmMute&&!isOwner){await reply('❌ Admin only!');break;}
          await socket.groupSettingUpdate(from,'announcement');
          await reply('✅ *Group muted! Only admins can send.*');
          break;
        }

        // ==================== UNMUTE ====================
        case 'unmute':{
          if(!isGroup){await reply('❌ Group only!');break;}
          const gmUnmute=await socket.groupMetadata(from);
          const isAdmUnmute=gmUnmute.participants.find(p=>p.id===nowsender)?.admin;
          if(!isAdmUnmute&&!isOwner){await reply('❌ Admin only!');break;}
          await socket.groupSettingUpdate(from,'not_announcement');
          await reply('✅ *Group unmuted! Everyone can send.*');
          break;
        }

        // ==================== GROUP INFO ====================
        case 'groupinfo':
        case 'ginfo':{
          if(!isGroup){await reply('❌ Group only!');break;}
          const gmI=await socket.groupMetadata(from);
          const adminsI=gmI.participants.filter(p=>p.admin).map(p=>`@${p.id.split('@')[0]}`).join(', ');
          await reply(`*👥 GROUP INFO*\n\n*Name:* ${gmI.subject}\n*ID:* ${from}\n*Created:* ${new Date(gmI.creation*1000).toDateString()}\n*Members:* ${gmI.participants.length}\n*Admins:* ${adminsI}\n*Desc:* ${gmI.desc||'N/A'}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== TAGALL ====================
        case 'tagall':
        case 'everyone':
        case 'all':{
          if(!isGroup){await reply('❌ Group only!');break;}
          const gmT=await socket.groupMetadata(from);
          const isAdmT=gmT.participants.find(p=>p.id===nowsender)?.admin;
          if(!isAdmT&&!isOwner){await reply('❌ Admin only!');break;}
          const mentions=gmT.participants.map(p=>p.id);
          let tagText=`*📢 ${q||'Attention everyone!'}*\n\n`;
          mentions.forEach(m2=>{tagText+=`@${m2.split('@')[0]} `;});
          await socket.sendMessage(from,{text:tagText,mentions},{quoted:msg});
          break;
        }

        // ==================== INVITE LINK ====================
        case 'invite':
        case 'link':{
          if(!isGroup){await reply('❌ Group only!');break;}
          const gmL=await socket.groupMetadata(from);
          const isAdmL=gmL.participants.find(p=>p.id===nowsender)?.admin;
          if(!isAdmL&&!isOwner){await reply('❌ Admin only!');break;}
          const invCode=await socket.groupInviteCode(from);
          await reply(`*🔗 INVITE LINK*\n\nhttps://chat.whatsapp.com/${invCode}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== REVOKE ====================
        case 'revoke':{
          if(!isGroup){await reply('❌ Group only!');break;}
          const gmR=await socket.groupMetadata(from);
          const isAdmR=gmR.participants.find(p=>p.id===nowsender)?.admin;
          if(!isAdmR&&!isOwner){await reply('❌ Admin only!');break;}
          await socket.groupRevokeInvite(from);
          await reply('✅ *Group invite link revoked!*');
          break;
        }

        // ==================== SETNAME ====================
        case 'setname':
        case 'rename':{
          if(!isGroup){await reply('❌ Group only!');break;}
          if(!q){await reply(`*Usage:* ${prefix}setname <new name>`);break;}
          const gmN=await socket.groupMetadata(from);
          const isAdmN=gmN.participants.find(p=>p.id===nowsender)?.admin;
          if(!isAdmN&&!isOwner){await reply('❌ Admin only!');break;}
          await socket.groupUpdateSubject(from,q);
          await reply(`✅ *Group name changed to:* ${q}`);
          break;
        }

        // ==================== SETDESC ====================
        case 'setdesc':{
          if(!isGroup){await reply('❌ Group only!');break;}
          if(!q){await reply(`*Usage:* ${prefix}setdesc <description>`);break;}
          const gmDesc=await socket.groupMetadata(from);
          const isAdmDesc=gmDesc.participants.find(p=>p.id===nowsender)?.admin;
          if(!isAdmDesc&&!isOwner){await reply('❌ Admin only!');break;}
          await socket.groupUpdateDescription(from,q);
          await reply('✅ *Group description updated!*');
          break;
        }

        // ==================== MEMBERS ====================
        case 'members':{
          if(!isGroup){await reply('❌ Group only!');break;}
          const gmM=await socket.groupMetadata(from);
          let mText=`*👥 MEMBERS (${gmM.participants.length})*\n\n`;
          gmM.participants.forEach((p,i)=>{mText+=`${i+1}. ${p.id.split('@')[0]} ${p.admin?'👑':''}\n`;});
          mText+=`\n> *ʀᴜᴍɪ-ɪɪ*`;
          await reply(mText);
          break;
        }

        // ==================== ADMINS ====================
        case 'admins':{
          if(!isGroup){await reply('❌ Group only!');break;}
          const gmA=await socket.groupMetadata(from);
          const adminList=gmA.participants.filter(p=>p.admin);
          let aText=`*👑 ADMINS (${adminList.length})*\n\n`;
          adminList.forEach((p,i)=>{aText+=`${i+1}. @${p.id.split('@')[0]} ${p.admin==='superadmin'?'(Owner)':''}\n`;});
          aText+=`\n> *ʀᴜᴍɪ-ɪɪ*`;
          await socket.sendMessage(from,{text:aText,mentions:adminList.map(p=>p.id)},{quoted:msg});
          break;
        }

        // ==================== SETTINGS MENU ====================
        case 'settings':{
          await react('⚙️');
          await replyBtn(`\`⚙️ sᴇᴛᴛɪɴɢs ᴍᴇɴᴜ ⚙️\`\n\n╭─ 🗑️ *SESSION*\n│ ✦ ${prefix}deleteme\n│ ✦ ${prefix}bots\n╰──────\n\n╭─ 📰 *NEWSLETTER*\n│ ✦ ${prefix}follow [jid]\n│ ✦ ${prefix}unfollow [jid]\n╰──────\n\n╭─ 📢 *SUPPORT*\n│ ✦ ${prefix}support\n╰──────`,[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
            {buttonId:`${prefix}owner`,buttonText:{displayText:'👑 Owner'},type:1},
          ]);
          break;
        }

        // ==================== DELETEME ====================
        case 'deleteme':{
          const s3=(number||'').replace(/[^0-9]/g,'');
          if(senderNumber!==s3&&senderNumber!==config.OWNER_NUMBER.replace(/[^0-9]/g,'')){await reply('❌ Permission denied!');break;}
          try{
            await removeSessionFromMongo(s3); await removeNumberFromMongo(s3);
            const sp=path.join(os.tmpdir(),`session_${s3}`);
            if(fs.existsSync(sp))fs.removeSync(sp);
            try{if(typeof socket.logout==='function')await socket.logout().catch(()=>{});}catch(e){}
            try{socket.ws?.close();}catch(e){}
            activeSockets.delete(s3); socketCreationTime.delete(s3);
            await socket.sendMessage(sender,{image:{url:config.IMAGE_PATH},caption:formatMessage('*🗑️ SESSION DELETED*','*✅ Session deleted successfully.*',BOT_NAME)},{quoted:fakevcard});
          }catch(e){await reply(`❌ Failed: ${e.message}`);}
          break;
        }

        // ==================== BOTS (SESSIONS) ====================
        case 'bots':
        case 'sessions':{
          const admins3=await loadAdminsFromMongo();
          const isAdm3=admins3.some(a=>a.replace(/[^0-9]/g,'')===senderNumber)||isOwner;
          if(!isAdm3){await reply('❌ Owner/Admin only!');break;}
          const activeNums=Array.from(activeSockets.keys());
          let bText=`*👀 ACTIVE SESSIONS*\n\n*Total:* ${activeNums.length}\n\n`;
          activeNums.forEach((n,i)=>{bText+=`${i+1}. ${n}\n`;});
          bText+=`\n*🕒 Checked:* ${getTimestamp()}\n\n> *ʀᴜᴍɪ-ɪɪ*`;
          await replyImgBtn(config.IMAGE_PATH,bText,[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
            {buttonId:`${prefix}ping`,buttonText:{displayText:'📡 Ping'},type:1},
          ]);
          break;
        }

        // ==================== OWNER MENU ====================
        case 'ownermenu':{
          if(!isOwner){await reply('❌ Owner only!');break;}
          await react('👑');
          await replyBtn(`\`👑 ᴏᴡɴᴇʀ ᴄᴏᴍᴍᴀɴᴅs 👑\`\n\n╭─ 📢 *MANAGEMENT*\n│ ✦ ${prefix}bots\n│ ✦ ${prefix}broadcast [msg]\n│ ✦ ${prefix}deletenumber [num]\n╰──────\n\n╭─ 📰 *NEWSLETTER*\n│ ✦ ${prefix}follow [jid]\n│ ✦ ${prefix}unfollow [jid]\n╰──────`,[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
            {buttonId:`${prefix}bots`,buttonText:{displayText:'📊 Sessions'},type:1},
          ]);
          break;
        }

        // ==================== BROADCAST ====================
        case 'broadcast':
        case 'bc':{
          if(!isOwner){await reply('❌ Owner only!');break;}
          if(!q){await reply(`*📢 Usage:* ${prefix}bc <message>`);break;}
          const nums2=await getAllNumbersFromMongo();
          let sentCount=0;
          for(const n2 of nums2){try{const s4=activeSockets.get(n2);if(s4){await s4.sendMessage(`${n2}@s.whatsapp.net`,{text:`*📢 BROADCAST — ${BOT_NAME}*\n\n${q}\n\n*🕒 ${getTimestamp()}*`});sentCount++;}}catch(e){}}
          await reply(`✅ *Broadcast sent to ${sentCount} users!*`);
          break;
        }

        // ==================== FOLLOW NEWSLETTER ====================
        case 'follow':{
          if(!isOwner){await reply('❌ Owner only!');break;}
          if(!q){await reply(`*Usage:* ${prefix}follow <newsletter JID>`);break;}
          await addNewsletterToMongo(q,config.AUTO_LIKE_EMOJI);
          await reply(`✅ *Added newsletter:* ${q}`);
          break;
        }

        // ==================== UNFOLLOW ====================
        case 'unfollow':{
          if(!isOwner){await reply('❌ Owner only!');break;}
          if(!q){await reply(`*Usage:* ${prefix}unfollow <newsletter JID>`);break;}
          await removeNewsletterFromMongo(q);
          await reply(`✅ *Removed newsletter:* ${q}`);
          break;
        }

        // ==================== DELETE NUMBER ====================
        case 'deletenumber':
        case 'deletemenumber':{
          if(!isOwner){await reply('❌ Owner only!');break;}
          if(!q){await reply(`*Usage:* ${prefix}deletenumber <number>`);break;}
          const t3=q.replace(/[^0-9]/g,'');
          await removeSessionFromMongo(t3); await removeNumberFromMongo(t3);
          const rs=activeSockets.get(t3);
          if(rs){try{await rs.logout().catch(()=>{});}catch(e){}try{rs.ws?.close();}catch(e){}activeSockets.delete(t3);socketCreationTime.delete(t3);}
          const tp=path.join(os.tmpdir(),`session_${t3}`);
          if(fs.existsSync(tp))fs.removeSync(tp);
          await socket.sendMessage(sender,{image:{url:config.IMAGE_PATH},caption:formatMessage('*🗑️ SESSION REMOVED*',`*✅ Session for ${t3} deleted.*`,BOT_NAME)},{quoted:msg});
          break;
        }

        // ==================== RUNTIME ====================
        case 'runtime':
        case 'uptime':{
          await react('⏰');
          await reply(`*⏰ BOT RUNTIME*\n\n*Uptime:* ${uptime()}\n*Time:* ${getTimestamp()}\n\n> *ʀᴜᴍɪ-ɪɪ*`);
          break;
        }

        // ==================== SUPPORT ====================
        case 'support':
        case 'channel':{
          await replyBtn(`*🤝 SUPPORT RUMI-II*\n\n*Channel:* ${config.CHANNEL_LINK}\n*Owner:* GladdyKing\n*Number:* +263775953409\n\nThank you for using RUMI-II! 🙏\n\n> *ʀᴜᴍɪ-ɪɪ*`,[
            {buttonId:`${prefix}menu`,buttonText:{displayText:'📋 Menu'},type:1},
          ]);
          break;
        }

        default:
          break;
      }
    }catch(err){
      console.error('Command error:',err);
      try{await socket.sendMessage(sender,{image:{url:config.IMAGE_PATH},caption:formatMessage('❌ ERROR','An error occurred. Please try again.',BOT_NAME)});}catch(e){}
    }
  });
}

// ==================== MESSAGE HANDLER ====================
function setupMessageHandlers(socket){
  socket.ev.on('messages.upsert',async({messages})=>{
    const msg=messages[0];
    if(!msg.message||msg.key.remoteJid==='status@broadcast')return;
    if(config.AUTO_RECORDING==='true'){try{await socket.sendPresenceUpdate('recording',msg.key.remoteJid);}catch(e){}}
  });
}

// ==================== CLEANUP ====================
async function deleteSessionAndCleanup(number,socketInstance){
  const s=(number||'').replace(/[^0-9]/g,'');
  try{
    const sp=path.join(os.tmpdir(),`session_${s}`);
    try{if(fs.existsSync(sp))fs.removeSync(sp);}catch(e){}
    activeSockets.delete(s); socketCreationTime.delete(s);
    try{await removeSessionFromMongo(s);}catch(e){}
    try{await removeNumberFromMongo(s);}catch(e){}
    try{
      const ownerJid=`${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
      const caption=formatMessage('*💀 SESSION REMOVED*',`Number: ${s}\nRemoved due to logout.\n\nActive sessions: ${activeSockets.size}`,BOT_NAME);
      if(socketInstance&&socketInstance.sendMessage)await socketInstance.sendMessage(ownerJid,{image:{url:config.IMAGE_PATH},caption});
    }catch(e){}
    console.log(`Cleanup completed for ${s}`);
  }catch(err){console.error('Cleanup error:',err);}
}

// ==================== AUTO RESTART ====================
function setupAutoRestart(socket,number){
  socket.ev.on('connection.update',async(update)=>{
    const{connection,lastDisconnect}=update;
    if(connection==='close'){
      const statusCode=lastDisconnect?.error?.output?.statusCode||lastDisconnect?.error?.statusCode;
      const isLoggedOut=statusCode===401||String(lastDisconnect?.error||'').toLowerCase().includes('logged out');
      if(isLoggedOut){
        console.log(`User ${number} logged out. Cleaning up...`);
        try{await deleteSessionAndCleanup(number,socket);}catch(e){}
      }else{
        console.log(`Reconnecting ${number}...`);
        try{await delay(10000);activeSockets.delete(number.replace(/[^0-9]/g,''));socketCreationTime.delete(number.replace(/[^0-9]/g,''));const mockRes={headersSent:false,send:()=>{},status:()=>mockRes};await RUMIPair(number,mockRes);}catch(e){console.error('Reconnect failed:',e);}
      }
    }
  });
}

// ==================== MAIN PAIRING FUNCTION ====================
async function RUMIPair(number,res){
  const sanitized=number.replace(/[^0-9]/g,'');
  const sessionPath=path.join(os.tmpdir(),`session_${sanitized}`);
  await initMongo().catch(()=>{});
  try{
    const mongoDoc=await loadCredsFromMongo(sanitized);
    if(mongoDoc&&mongoDoc.creds){
      fs.ensureDirSync(sessionPath);
      fs.writeFileSync(path.join(sessionPath,'creds.json'),JSON.stringify(mongoDoc.creds,null,2));
      if(mongoDoc.keys)fs.writeFileSync(path.join(sessionPath,'keys.json'),JSON.stringify(mongoDoc.keys,null,2));
      console.log('Prefilled creds from Mongo');
    }
  }catch(e){console.warn('Prefill from Mongo failed',e);}

  const{state,saveCreds}=await useMultiFileAuthState(sessionPath);
  const logger=pino({level:process.env.NODE_ENV==='production'?'fatal':'debug'});

  try{
    const socket=makeWASocket({
      auth:{creds:state.creds,keys:makeCacheableSignalKeyStore(state.keys,logger)},
      printQRInTerminal:false,logger,browser:Browsers.macOS('Safari')
    });

    socketCreationTime.set(sanitized,Date.now());
    setupStatusHandlers(socket);
    setupCommandHandlers(socket,sanitized);
    setupMessageHandlers(socket);
    setupAutoRestart(socket,sanitized);
    setupNewsletterHandlers(socket,sanitized);
    handleMessageRevocation(socket);

    if(!socket.authState.creds.registered){
      let retries=config.MAX_RETRIES,code;
      while(retries>0){try{await delay(1500);code=await socket.requestPairingCode(sanitized);break;}catch(e){retries--;await delay(2000*(config.MAX_RETRIES-retries));}}
      if(!res.headersSent)res.send({code});
    }

    socket.ev.on('creds.update',async()=>{
      try{
        await saveCreds();
        const fileContent=await fs.readFile(path.join(sessionPath,'creds.json'),'utf8');
        const credsObj=JSON.parse(fileContent);
        await saveCredsToMongo(sanitized,credsObj,state.keys||null);
      }catch(err){console.error('Failed saving creds:',err);}
    });

    socket.ev.on('connection.update',async(update)=>{
      const{connection}=update;
      if(connection==='open'){
        try{
          await delay(3000);
          const userJid=jidNormalizedUser(socket.user.id);
          const groupResult=await joinGroup(socket).catch(()=>({status:'failed',error:'not configured'}));

          try{const nlDocs=await listNewslettersFromMongo();for(const doc of nlDocs){try{if(typeof socket.newsletterFollow==='function')await socket.newsletterFollow(doc.jid);}catch(e){}}}catch(e){}

          activeSockets.set(sanitized,socket);

          const userConfig=await loadUserConfigFromMongo(sanitized)||{};
          const useBotName=userConfig.botName||BOT_NAME;
          const useLogo=userConfig.logo||config.IMAGE_PATH;

          const initialCaption=formatMessage(useBotName,
            `*✅ Connected Successfully!*\n\n*🔢 Number:* ${sanitized}\n*🕒 Bot will be active in a few seconds...*`,
            useBotName
          );

          let sentMsg=null;
          try{sentMsg=await socket.sendMessage(userJid,{image:{url:useLogo},caption:initialCaption});}
          catch(e){try{sentMsg=await socket.sendMessage(userJid,{text:initialCaption});}catch(e){}}

          await delay(4000);

          const updatedCaption=formatMessage(useBotName,
            `*✅ Connected & Active!*\n\n*🔢 Number:* ${sanitized}\n*📡 Status:* ${groupResult.status==='success'?'Group Joined ✅':`${groupResult.error}`}\n*🕒 Connected:* ${getTimestamp()}\n\n*Type .menu to get started!*`,
            useBotName
          );

          try{if(sentMsg&&sentMsg.key){try{await socket.sendMessage(userJid,{delete:sentMsg.key});}catch(e){}}}catch(e){}
          try{await socket.sendMessage(userJid,{image:{url:useLogo},caption:updatedCaption,buttons:[
            {buttonId:'.menu',buttonText:{displayText:'📋 MENU'},type:1},
            {buttonId:'.alive',buttonText:{displayText:'⏰ ALIVE'},type:1},
          ],headerType:4});}catch(e){try{await socket.sendMessage(userJid,{text:updatedCaption});}catch(e){}}

          await sendAdminConnectMessage(socket,sanitized,groupResult,userConfig);
          await addNumberToMongo(sanitized);
        }catch(e){console.error('Connection open error:',e);}
      }
      if(connection==='close'){try{if(fs.existsSync(sessionPath))fs.removeSync(sessionPath);}catch(e){}}
    });

    activeSockets.set(sanitized,socket);
  }catch(error){
    console.error('Pairing error:',error);
    socketCreationTime.delete(sanitized);
    if(!res.headersSent)res.status(503).send({error:'Service Unavailable'});
  }
}

// ==================== ENDPOINTS ====================
router.get('/',async(req,res)=>{
  const{number}=req.query;
  if(!number)return res.status(400).send({error:'Number required'});
  if(activeSockets.has(number.replace(/[^0-9]/g,'')))return res.status(200).send({status:'already_connected',message:'Already connected'});
  await RUMIPair(number,res);
});
router.get('/active',(req,res)=>{res.status(200).send({botName:BOT_NAME,count:activeSockets.size,numbers:Array.from(activeSockets.keys()),timestamp:getTimestamp()});});
router.get('/ping',(req,res)=>{res.status(200).send({status:'active',botName:BOT_NAME,owner:'GladdyKing',activeSessions:activeSockets.size});});
router.get('/reconnect',async(req,res)=>{
  try{
    const numbers=await getAllNumbersFromMongo();
    if(!numbers||!numbers.length)return res.status(404).send({error:'No numbers found'});
    const results=[];
    for(const n of numbers){if(activeSockets.has(n)){results.push({number:n,status:'already_connected'});continue;}const mockRes={headersSent:false,send:()=>{},status:()=>mockRes};try{await RUMIPair(n,mockRes);results.push({number:n,status:'initiated'});}catch(err){results.push({number:n,status:'failed',error:err.message});}await delay(1000);}
    res.status(200).send({status:'success',connections:results});
  }catch(error){res.status(500).send({error:'Failed'});}
});

// Newsletter endpoints
router.post('/newsletter/add',async(req,res)=>{const{jid,emojis}=req.body;if(!jid)return res.status(400).send({error:'jid required'});try{await addNewsletterToMongo(jid,Array.isArray(emojis)?emojis:[]);res.status(200).send({status:'ok',jid});}catch(e){res.status(500).send({error:e.message});}});
router.post('/newsletter/remove',async(req,res)=>{const{jid}=req.body;if(!jid)return res.status(400).send({error:'jid required'});try{await removeNewsletterFromMongo(jid);res.status(200).send({status:'ok',jid});}catch(e){res.status(500).send({error:e.message});}});
router.get('/newsletter/list',async(req,res)=>{try{res.status(200).send({status:'ok',channels:await listNewslettersFromMongo()});}catch(e){res.status(500).send({error:e.message});}});

// Admin endpoints
router.post('/admin/add',async(req,res)=>{const{jid}=req.body;if(!jid)return res.status(400).send({error:'jid required'});try{await addAdminToMongo(jid);res.status(200).send({status:'ok',jid});}catch(e){res.status(500).send({error:e.message});}});
router.post('/admin/remove',async(req,res)=>{const{jid}=req.body;if(!jid)return res.status(400).send({error:'jid required'});try{await removeAdminFromMongo(jid);res.status(200).send({status:'ok',jid});}catch(e){res.status(500).send({error:e.message});}});
router.get('/admin/list',async(req,res)=>{try{res.status(200).send({status:'ok',admins:await loadAdminsFromMongo()});}catch(e){res.status(500).send({error:e.message});}});

// Config endpoints
router.get('/update-config',async(req,res)=>{
  const{number,config:configString}=req.query;
  if(!number||!configString)return res.status(400).send({error:'Number and config required'});
  let newConfig;try{newConfig=JSON.parse(configString);}catch(e){return res.status(400).send({error:'Invalid config'});}
  const sanitized=number.replace(/[^0-9]/g,'');
  const socket=activeSockets.get(sanitized);
  if(!socket)return res.status(404).send({error:'No active session'});
  const otp=generateOTP();
  otpStore.set(sanitized,{otp,expiry:Date.now()+config.OTP_EXPIRY,newConfig});
  try{await sendOTP(socket,sanitized,otp);res.status(200).send({status:'otp_sent'});}
  catch(e){otpStore.delete(sanitized);res.status(500).send({error:'Failed to send OTP'});}
});
router.get('/verify-otp',async(req,res)=>{
  const{number,otp}=req.query;
  if(!number||!otp)return res.status(400).send({error:'Number and OTP required'});
  const sanitized=number.replace(/[^0-9]/g,'');
  const stored=otpStore.get(sanitized);
  if(!stored)return res.status(400).send({error:'No OTP request found'});
  if(Date.now()>=stored.expiry){otpStore.delete(sanitized);return res.status(400).send({error:'OTP expired'});}
  if(stored.otp!==otp)return res.status(400).send({error:'Invalid OTP'});
  try{
    await setUserConfigInMongo(sanitized,stored.newConfig);otpStore.delete(sanitized);
    const sock=activeSockets.get(sanitized);
    if(sock)await sock.sendMessage(jidNormalizedUser(sock.user.id),{image:{url:config.IMAGE_PATH},caption:formatMessage('📌 CONFIG UPDATED','Your config has been updated!',BOT_NAME)});
    res.status(200).send({status:'success'});
  }catch(e){res.status(500).send({error:'Failed'});}
});

// API sessions
router.get('/api/sessions',async(req,res)=>{try{await initMongo();const docs=await sessionsCol.find({},{projection:{number:1,updatedAt:1}}).sort({updatedAt:-1}).toArray();res.json({ok:true,sessions:docs});}catch(err){res.status(500).json({ok:false,error:err.message});}});
router.get('/api/active',async(req,res)=>{try{const keys=Array.from(activeSockets.keys());res.json({ok:true,active:keys,count:keys.length});}catch(err){res.status(500).json({ok:false,error:err.message});}});
router.post('/api/session/delete',async(req,res)=>{
  try{
    const{number}=req.body;if(!number)return res.status(400).json({ok:false,error:'number required'});
    const s=(''+number).replace(/[^0-9]/g,'');
    const running=activeSockets.get(s);
    if(running){try{if(typeof running.logout==='function')await running.logout().catch(()=>{});}catch(e){}try{running.ws?.close();}catch(e){}activeSockets.delete(s);socketCreationTime.delete(s);}
    await removeSessionFromMongo(s);await removeNumberFromMongo(s);
    try{const sp=path.join(os.tmpdir(),`session_${s}`);if(fs.existsSync(sp))fs.removeSync(sp);}catch(e){}
    res.json({ok:true,message:`Session ${s} removed`});
  }catch(err){res.status(500).json({ok:false,error:err.message});}
});

// ==================== PROCESS EVENTS ====================
process.on('exit',()=>{activeSockets.forEach((socket,number)=>{try{socket.ws.close();}catch(e){}activeSockets.delete(number);socketCreationTime.delete(number);try{fs.removeSync(path.join(os.tmpdir(),`session_${number}`));}catch(e){}});});
process.on('uncaughtException',(err)=>{console.error('Uncaught exception:',err);try{exec(`pm2 restart ${process.env.PM2_NAME||'RUMI-II'}`);}catch(e){}});

// ==================== STARTUP ====================
initMongo().catch(err=>console.warn('Mongo init failed:',err));
(async()=>{
  try{
    const nums=await getAllNumbersFromMongo();
    if(nums&&nums.length){
      console.log(`🔄 Reconnecting ${nums.length} sessions...`);
      for(const n of nums){if(!activeSockets.has(n)){const mockRes={headersSent:false,send:()=>{},status:()=>mockRes};await RUMIPair(n,mockRes);await delay(500);}}
    }
  }catch(e){console.warn('Auto-reconnect failed:',e);}
})();

module.exports=router;
