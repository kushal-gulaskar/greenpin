import {useEffect,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import {MapPin} from 'lucide-react'
import type {Tree} from './data'
import 'maplibre-gl/dist/maplibre-gl.css'
export default function MapView({trees}:{trees:Tree[]}){
 const host=useRef<HTMLDivElement>(null),[enabled,setEnabled]=useState(false),[error,setError]=useState('')
 const style=import.meta.env.VITE_MAP_STYLE_URL
 useEffect(()=>{
  if(!enabled||!host.current)return
  const container=host.current
  let cancelled=false,dispose=()=>{}
  import('maplibre-gl').then(({Map,Marker,LngLatBounds,NavigationControl})=>{
   if(cancelled)return
   const map=new Map({container,style,center:[79,22],zoom:4});dispose=()=>map.remove()
   map.on('error',()=>setError('Map data is unavailable. Use the location list below.'))
   const bounds=new LngLatBounds()
   for(const t of trees){new Marker().setLngLat([t.lng,t.lat]).addTo(map).getElement().title=t.name;bounds.extend([t.lng,t.lat])}
   if(trees.length)map.fitBounds(bounds,{padding:50,maxZoom:14,duration:0})
   map.addControl(new NavigationControl())
  }).catch(()=>setError('Map unavailable. Use the location list below.'))
  return()=>{cancelled=true;dispose()}
 },[enabled,style,trees])
 return <><h1>Explore map</h1><p className="intro">Find a tree by its registered location.</p><section className="panel pad"><h2>Tree locations</h2><p>{style?'Opening the map shares the viewing area with the configured tile provider.':'Local location view · No tile provider configured.'}</p>{style&&!enabled&&<button className="primary" onClick={()=>setEnabled(true)}>Allow and open map</button>}{enabled&&<div className="map" ref={host}/>}<p role="status">{error}</p>{trees.map(t=><Link className="activity" key={t.id} to={'/trees/'+t.id}><MapPin size={20}/><div><b>{t.name}</b><small>{t.location} · {t.lat}, {t.lng}</small></div></Link>)}</section></>
}