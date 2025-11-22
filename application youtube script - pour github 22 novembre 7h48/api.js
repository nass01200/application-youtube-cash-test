function getClient(){
  const url=(localStorage.getItem('cep-supabase-url')||'')||'https://obrhatwvdhkdcgpjrpou.supabase.co'
  const key=(localStorage.getItem('cep-supabase-key')||'')||'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9icmhhdHd2ZGhrZGNncGpycG91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzODcwNjYsImV4cCI6MjA3ODk2MzA2Nn0.DkoXBYO_8OJP5CsOxspg1n2Wdh1HT5R3egxvsHeYuJM'
  return supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true}})
}
async function signup(email,pseudo,password){
  const c=getClient()
  const {data,error}=await c.auth.signUp({email,password,options:{data:{pseudo}}})
  if(error)throw error
  try{const uid=data?.user?.id||null;if(uid){await c.from('profiles').upsert({id:uid,email,pseudo},{onConflict:'id'})}}catch(e){}
  return data
}
async function login(email,password){
  const c=getClient()
  const {data,error}=await c.auth.signInWithPassword({email,password})
  if(error)throw error
  return data
}
async function getUserData(userId){
  const c=getClient()
  const table=window.state?.cloud?.table||'app_state'
  const {data,error}=await c.from(table).select('*').eq('userId',userId).limit(1)
  if(error)throw error
  return (data&&data[0])||null
}
async function saveUserData(userId,payload){
  const c=getClient()
  const table=window.state?.cloud?.table||'app_state'
  const record={userId,payload,lastSaved:new Date().toISOString()}
  const {error}=await c.from(table).upsert(record,{onConflict:'userId'})
  if(error)throw error
  return {ok:true}
}
