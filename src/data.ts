export type Tree = {
 owner?:string; id:string; name:string; scientific:string; species:string; kind:string; planted:string; age:string;
 photo:Blob|string; lat:number; lng:number; location:string; health:string; notes:string;
 created:string; demo:boolean; adopted:boolean
}
export const brand=import.meta.env.VITE_APP_NAME?.trim() || 'GreenPin'
export const species=['Neem','Banyan','Peepal','Mango','Gulmohar','Other / unknown']
export const healthOptions=['Healthy','Needs attention','Under treatment','Unknown']
const samples=[
 ['Neem','Azadirachta indica','Cubbon Park, Bengaluru','12.976','77.593','canopy'],
 ['Banyan','Ficus benghalensis','Aundh, Pune','18.559','73.808','forest'],
 ['Peepal','Ficus religiosa','Lodhi Gardens, New Delhi','28.594','77.219','light'],
 ['Mango','Mangifera indica','Aliganj, Lucknow','26.894','80.941','canopy']
]
export const demoTrees:Tree[]=samples.map(([name,scientific,location,lat,lng,img],i)=>({
 id:'44e0bbef-0cc9-4523-84be-b8840000000'+i,name,scientific,species:name,location,lat:+lat,lng:+lng,
 photo:'/images/'+img+'.jpg',health:i===1?'Needs attention':'Healthy',created:'2026-06-0'+(8-i)+'T10:00:00Z',
 demo:true,adopted:i===2,kind:i%2?'Existing tree':'New plantation',age:'',planted:'',notes:''
}))
export interface TreeRepository {list():Promise<Tree[]>;add(tree:Tree):Promise<void>}
export function openDatabase():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('nature-ecosystem',2)
  request.onupgradeneeded=()=>{
   const db=request.result
   if(!db.objectStoreNames.contains('trees'))db.createObjectStore('trees',{keyPath:'id'})
   db.createObjectStore('journal',{keyPath:'id'}).createIndex('treeId','treeId')
  }
  request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result)}
  request.onerror=()=>reject(request.error)
 })
}
export const repository:TreeRepository={
 async list(){
  const db=await openDatabase()
  try{return await new Promise<Tree[]>((resolve,reject)=>{
   const req=db.transaction('trees').objectStore('trees').getAll()
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)
  })}finally{db.close()}
 },
 async add(tree){
  const db=await openDatabase()
  try{await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction('trees','readwrite')
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error)
   tx.objectStore('trees').add(tree)
  })}finally{db.close()}
 }
}
export const date=(value:string)=>new Date(value).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})
