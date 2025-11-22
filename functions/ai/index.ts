import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"}

async function callGemini(model:string,prompt:string,apiKey:string){
  async function gen(ver:string,m:string){
    const endpoint=`https://generativelanguage.googleapis.com/${ver}/models/${m}:generateContent?key=${apiKey}`
    const body={contents:[{role:"user",parts:[{text:prompt}]}]}
    const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
    const j=await r.json()
    const first=j?.candidates?.[0]
    const parts=(first?.content?.parts||[])
    const piece=Array.isArray(parts)?parts.find((p:any)=>typeof p?.text==="string"):null
    const txt=(piece?.text||"").toString()
    return { ok:r.ok, text:txt, raw:j }
  }
  async function list(apiKey:string){
    for(const ver of ["v1beta","v1"]){
      const url=`https://generativelanguage.googleapis.com/${ver}/models?key=${apiKey}`
      const r=await fetch(url)
      const j=await r.json()
      const arr=Array.isArray(j?.models)?j.models:[]
      const names=arr
        .filter((x:any)=>Array.isArray(x?.supportedGenerationMethods)&&x.supportedGenerationMethods.includes("generateContent"))
        .map((x:any)=>String(x?.name||"").replace(/^models\//,""))
        .filter((n:any)=>typeof n==="string"&&n.length>0)
      if(names.length)return { version:ver, models:names }
    }
    return { version:"", models:[] }
  }
  const baseModels=[
    model,
    model.endsWith("-latest")?model:(model+"-latest"),
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-lite-001",
    "gemini-1.5-pro-latest",
    "gemini-1.5-pro",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash"
  ]
  const versions=["v1","v1beta"]
  let last:any=null
  for(const m of baseModels){
    for(const v of versions){
      const r=await gen(v,m)
      last=r
      if(r.text&&r.text.trim())return { text:r.text, raw:r.raw }
    }
  }
  const discovered=await list(apiKey)
  if(discovered.models.length){
    const prefer=[
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash",
      "gemini-2.0-flash-001",
      "gemini-2.0-flash-lite",
      "gemini-2.0-flash-lite-001",
      "gemini-1.5-pro-latest",
      "gemini-1.5-pro",
      "gemini-1.5-flash-latest",
      "gemini-1.5-flash"
    ]
    let pick=prefer.find((n)=>discovered.models.includes(n))||discovered.models[0]
    const r=await gen(discovered.version,pick)
    last=r
    if(r.text&&r.text.trim())return { text:r.text, raw:r.raw }
  }
  return { text:"", raw:last?.raw }
}

function promptFor(kind:string,baseText:string,guidelines:string,keywords:string[],projectContext?:string){
  const keys=(keywords||[]).slice(0,8).join(", ")
  const ctx=projectContext&&projectContext.trim()?projectContext+"\n":""
  const sys=`Respecte ces consignes:\n${guidelines}\n\n${ctx}Utilise ces mots-clés secondaires: ${keys}. Ne te présentes pas, n'adopte pas une posture de coach; écris en cohérence avec le projet. Intègre les codes d’intonation dans le script: 🔺 voix montante, 🔻 voix descendante, 😐 ton neutre, 🤫 chuchoté, ⏸ pause.`
  if(kind==="convert_blog"){
    return `${sys}\n\nTâche: Convertis ce script en article de blog non-plagié, structuré (H1/H2/H3), avec bénéfices supplémentaires et CTA.\n\nScript:\n${baseText}`
  }else if(kind==="convert_email"){
    return `${sys}\n\nTâche: Convertis ce script en email court et impactant (Objet + corps), valeur concrète, 3 points clés max, preuve, CTA.\n\nScript:\n${baseText}`
  }else if(kind==="analyze_keywords"){
    return `${sys}\n\nTâche: Analyse ces mots-clés SEO et propose des recommandations concrètes (clusters thématiques, opportunités à faible difficulté et volume élevé, idées de titres optimisés, piliers de contenu, angles de vidéos et planning).\n\nDonnées:\n${baseText}`
  }
  return `${sys}\n\nTâche: Améliore et reformule ce texte en script final de vidéo YouTube (hook fort, structure claire, transitions, CTA).\n\nTexte:\n${baseText}`
}
function sanitizePersona(s:string){
  let t=(s||"").toString()
  const pats=[
    /en tant que coach[^\n]*/gi,
    /en tant qu['’]?expert[^\n]*/gi,
    /coach d['’]?écriture[^\n]*/gi,
    /coach[^\n]*marketing[^\n]*/gi,
    /coach[^\n]*youtube[^\n]*/gi,
    /en tant que marketeur[^\n]*/gi
  ]
  for(const r of pats){t=t.replace(r,"")}
  t=t.replace(/\n{3,}/g,"\n\n").trim()
  return t
}
function buildProjectContext(data:any){
  const p=(data?.formation?.project)||{}
  const pk=Array.isArray(p?.optimizedKeywords)?p.optimizedKeywords:[]
  const vk=Array.isArray(data?.video?.optimizedKeywords)?data.video.optimizedKeywords:(Array.isArray(data?.video?.seoKeywordsList)?data.video.seoKeywordsList.map((x:any)=>x?.kw).filter((x:any)=>x):[])
  const parts=[
    `Objectif du projet: ${p.goal||""}`,
    `Produit vendu: ${p.product||""}`,
    `Activité: ${p.activity||""}`,
    `Audience cible: ${p.audience||""}`,
    `Objectifs éditoriaux: ${p.objectives||""}`,
    `Mots-clés optimisés du projet: ${pk.slice(0,12).join(", ")}`,
    `Mots-clés vidéo: ${vk.slice(0,12).join(", ")}`
  ]
  return parts.join("\n")
}
function combineKeywords(data:any,keywords:string[]){
  const pk=Array.isArray(data?.formation?.project?.optimizedKeywords)?data.formation.project.optimizedKeywords:[]
  const vk=Array.isArray(data?.video?.optimizedKeywords)?data.video.optimizedKeywords:(Array.isArray(data?.video?.seoKeywordsList)?data.video.seoKeywordsList.map((x:any)=>x?.kw).filter((x:any)=>x):[])
  const base=Array.isArray(keywords)?keywords:[]
  const uniq:string[]=[]
  for(const k of [...base,...vk,...pk]){const t=(k||"").toString().trim();if(t&&!uniq.includes(t))uniq.push(t)}
  return uniq.slice(0,16)
}
function normTxt(s:any){return (String(s||"").toLowerCase()).normalize("NFD").replace(/[^a-z0-9\s-]/g," ").replace(/\s+/g," ").trim()}
function isPareBriseProject(p:any){const t=[p?.goal,p?.product,p?.activity,p?.objectives].map(normTxt).join(" ");return /pare\s*brise|parebrise/.test(t)}
function globalPareBriseGuidelines(){
  return [
    "Contexte: Make Money/Entrepreneuriat appliqué au remplacement de pare-brise, activité rentable, simple, duplicable.",
    "Chiffres: 400–800 € en ~2h, jusqu’à 1300 € sur certains véhicules; forte demande; marché national; activité sous-traitable et scalable.",
    "Objectif: produire du contenu aligné au business Pare-Brise (scripts YouTube, emails, blogs, suggestions, analyse SEO).",
    "Cible: personnes voulant gagner plus, sortir d’un job pénible, stabilité, entreprendre sans diplôme/expérience.",
    "Éditorial: inspirer, rassurer, clarifier, montrer que c’est faisable, casser les fausses croyances, conduire vers la formation.",
    "Ton: entrepreneur, chiffré, motivant, simple, clair, orienté résultats.",
    "Règles SEO: lire CSV SEMrush (Keyword, Volume, Keyword Difficulty); filtrer selon KD≤seuil et Volume≥seuil; fallback tri KD asc puis Volume desc; combiner mots-clés projet+vidéo+SEMrush pertinents; injecter la liste optimisée dans toutes les générations.",
    "Interdictions: ne pas dire ‘En tant que coach…’, ‘En tant qu’expert marketing…’, ‘Je vous recommande…’. Ne pas inventer de mots-clés hors CSV.",
  ].join("\n")
}

serve(async (req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors})
  try{
    const apiKey=Deno.env.get("GEMINI_API_KEY")
    if(!apiKey)return new Response(JSON.stringify({error:"Missing GEMINI_API_KEY"}),{status:500,headers:{...cors,"Content-Type":"application/json"}})
    const data=await req.json()
    const kind=(data?.kind||"improve_script").toString()
    const baseText=(data?.text||"").toString()
    const cleaned=sanitizePersona(baseText)
    let keywords=Array.isArray(data?.keywords)?data.keywords:[]
    const userGuidelines=(data?.guidelines||"").toString()
    if(!cleaned.trim())return new Response(JSON.stringify({error:"empty_input"}),{status:400,headers:{...cors,"Content-Type":"application/json"}})
    const model=(data?.model||"gemini-2.5-flash").toString()
    let projectContext=(data?.projectContext||"").toString()
    if(!projectContext.trim())projectContext=buildProjectContext(data)
    keywords=combineKeywords(data,keywords)
    const global=isPareBriseProject((data?.formation?.project)||{})?globalPareBriseGuidelines():""
    const guidelines=(global?global+"\n":"")+userGuidelines
    const prompt=promptFor(kind,cleaned,guidelines,keywords,projectContext)
    const res=await callGemini(model,prompt,apiKey)
    if(!res.text||!res.text.trim()){const details=(res?.raw?.error?.message||res?.raw?.promptFeedback?.blockReason||"empty_output")
      return new Response(JSON.stringify({error:"empty_output",details}),{status:400,headers:{...cors,"Content-Type":"application/json"}})
    }
    return new Response(JSON.stringify({text:res.text}),{headers:{...cors,"Content-Type":"application/json"}})
  }catch(err){
    return new Response(JSON.stringify({error:String(err?.message||err)}),{status:500,headers:{...cors,"Content-Type":"application/json"}})
  }
})
