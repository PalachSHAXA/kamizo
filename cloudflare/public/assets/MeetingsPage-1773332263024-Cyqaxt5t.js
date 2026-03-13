import{r as le,c as ie,u as ne,a3 as oe,D as H,j as e,Y as Z,q as K,a1 as J,U as ee,F as M,l as ce,C as re,X as F,x as de,a5 as me,L as pe,g as te,P as xe,a8 as he}from"./index-1773332263024-Dk5gSfgP.js";import{b as u}from"./charts-1773332263024-DnKBTueD.js";import{P as ue}from"./docx-gen-1773332263024-BU2P5vcA.js";import{Q as se}from"./browser-1773332263024-Qz8KzDez.js";import{u as be}from"./announcements-1773332263024-BdNhKVXr.js";import{M as D,A as T,D as q,T as Q}from"./meeting-1773332263024-Dp0Bi7u1.js";import{C as Y}from"./calendar-1773332263024-CakJjzNv.js";import{T as ve}from"./trash-2-1773332263024-CFDJmaXl.js";import{P as ge}from"./play-1773332263024-C_LAJunA.js";import{S as Pe}from"./square-1773332263024-H16nRT71.js";import{D as ae}from"./download-1773332263024-voVLyk79.js";import{P as fe}from"./paperclip-1773332263024-Cn45Gj13.js";import{S as V}from"./send-1773332263024-9hTobjbI.js";import{T as ye}from"./thumbs-up-1773332263024-CrBb_gLj.js";import{M as je}from"./minus-1773332263024-B1Z_ZZIg.js";const Ne=[["path",{d:"M8 2v4",key:"1cmpym"}],["path",{d:"M16 2v4",key:"4m81vk"}],["rect",{width:"18",height:"18",x:"3",y:"4",rx:"2",key:"1hopcy"}],["path",{d:"M3 10h18",key:"8toen8"}],["path",{d:"m9 16 2 2 4-4",key:"19s6y9"}]],ze=le("calendar-check",Ne),E={name:"OOO KAMIZO",address:"г. Ташкент, Яшнобадский район, ул. Махтумкули, дом 93/3",bank:"«Ориент Финанс» ЧАКБ Миробад филиал",account:"20208000805307918001",inn:"307928888",oked:"81100",mfo:"01071"};function _e(t,a){const r=URL.createObjectURL(t),m=/iPad|iPhone|iPod/.test(navigator.userAgent),c=/^((?!chrome|android).)*safari/i.test(navigator.userAgent);if(m||c)window.open(r,"_blank")||(window.location.href=r),setTimeout(()=>URL.revokeObjectURL(r),1e4);else{const o=document.createElement("a");o.href=r,o.download=a,o.style.display="none",document.body.appendChild(o),o.click(),document.body.removeChild(o),setTimeout(()=>URL.revokeObjectURL(r),100)}}const ke={0:"января",1:"февраля",2:"марта",3:"апреля",4:"мая",5:"июня",6:"июля",7:"августа",8:"сентября",9:"октября",10:"ноября",11:"декабря"};function $e(t){if(!t)return"___";const a=new Date(t);return`${a.getDate()} ${ke[a.getMonth()]} ${a.getFullYear()}`}function Ce(t){if(!t)return"___";const a=new Date(t);return`${a.getHours().toString().padStart(2,"0")}:${a.getMinutes().toString().padStart(2,"0")}`}function R(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}function Ie(t,a){const r=t.votes_for_area+t.votes_against_area+t.votes_abstain_area;return{votesFor:t.votes_for_area,votesAgainst:t.votes_against_area,votesAbstain:t.votes_abstain_area,percentFor:r>0?t.votes_for_area/r*100:0,percentAgainst:r>0?t.votes_against_area/r*100:0,percentAbstain:r>0?t.votes_abstain_area/r*100:0}}function X(t){const a=t.split(",")[1],r=atob(a),m=new Uint8Array(r.length);for(let c=0;c<r.length;c++)m[c]=r.charCodeAt(c);return m}async function Se(){const t=[`Компания: ${E.name}`,`Адрес: ${E.address}`,`Банк: ${E.bank}`,`Р/С: ${E.account}`,`ИНН: ${E.inn}`,`ОКЭД: ${E.oked}`,`МФО: ${E.mfo}`].join(`
`);return await se.toDataURL(t,{width:150,margin:1,color:{dark:"#1f2937",light:"#ffffff"}})}async function Ae(t,a,r){const m=["ЭЛЕКТРОННАЯ ПОДПИСЬ",`Протокол: ${a}`,`ФИО: ${t.voter_name}`,`Квартира: ${t.apartment_number||"-"}`,`Площадь: ${t.vote_weight?.toFixed(2)||"-"} кв.м`,`Голос: ${t.choice==="for"?"ЗА":t.choice==="against"?"ПРОТИВ":"ВОЗДЕРЖАЛСЯ"}`,`Дата: ${new Date(t.voted_at).toLocaleString("ru-RU")}`,`Адрес: ${r}`].join(`
`);return await se.toDataURL(m,{width:80,margin:1,color:{dark:"#1f2937",light:"#ffffff"}})}function G(t){return`
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="9000" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="000000"/>
      <w:left w:val="single" w:sz="4" w:color="000000"/>
      <w:bottom w:val="single" w:sz="4" w:color="000000"/>
      <w:right w:val="single" w:sz="4" w:color="000000"/>
      <w:insideH w:val="single" w:sz="4" w:color="000000"/>
      <w:insideV w:val="single" w:sz="4" w:color="000000"/>
    </w:tblBorders>
    <w:jc w:val="center"/>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="3000"/>
    <w:gridCol w:w="3000"/>
    <w:gridCol w:w="3000"/>
  </w:tblGrid>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>ЗА</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>ПРОТИВ</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>ВОЗДЕРЖАЛИСЬ</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>${t.votesFor.toFixed(2)} кв.м</w:t></w:r></w:p>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>(${t.percentFor.toFixed(1)}%)</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>${t.votesAgainst.toFixed(2)} кв.м</w:t></w:r></w:p>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>(${t.percentAgainst.toFixed(1)}%)</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>${t.votesAbstain.toFixed(2)} кв.м</w:t></w:r></w:p>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>(${t.percentAbstain.toFixed(1)}%)</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
</w:tbl>`}function Te(t,a){let r=`
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="9500" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="000000"/>
      <w:left w:val="single" w:sz="4" w:color="000000"/>
      <w:bottom w:val="single" w:sz="4" w:color="000000"/>
      <w:right w:val="single" w:sz="4" w:color="000000"/>
      <w:insideH w:val="single" w:sz="4" w:color="000000"/>
      <w:insideV w:val="single" w:sz="4" w:color="000000"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="500"/>
    <w:gridCol w:w="2800"/>
    <w:gridCol w:w="800"/>
    <w:gridCol w:w="1200"/>
    <w:gridCol w:w="1400"/>
    <w:gridCol w:w="1400"/>
    <w:gridCol w:w="1400"/>
  </w:tblGrid>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>№</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>ФИО собственника</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Кв.</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Площадь</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Дата</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Голос</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Э-подпись</w:t></w:r></w:p>
    </w:tc>
  </w:tr>`;return t.forEach((m,c)=>{const o=new Date(m.voted_at),y=m.choice==="for"?"ЗА":m.choice==="against"?"ПРОТИВ":"ВОЗДЕРЖ.",P=a.get(m.voter_id),b=P?`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="600000" cy="600000"/><wp:docPr id="${1e3+c}" name="QR Signature ${c}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="voter_qr_${c}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${P}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="600000" cy="600000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`:"<w:r><w:t>✓</w:t></w:r>";r+=`
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${c+1}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${R(m.voter_name)}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${m.apartment_number||"-"}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${m.vote_weight?.toFixed(2)||"-"}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${o.toLocaleDateString("ru-RU")}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${y}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/></w:pPr>${b}</w:p>
    </w:tc>
  </w:tr>`}),r+="</w:tbl>",r}function qe(t,a){if(!a||a.length===0)return"";const r=a.some(c=>c.comment&&c.comment.trim().length>0);let m=`
<w:p><w:pPr><w:spacing w:before="100"/><w:rPr><w:i/><w:sz w:val="18"/></w:rPr></w:pPr>
<w:r><w:rPr><w:i/><w:sz w:val="18"/></w:rPr><w:t>Голоса участников:</w:t></w:r></w:p>
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="${r?"10500":"9000"}" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="000000"/>
      <w:left w:val="single" w:sz="4" w:color="000000"/>
      <w:bottom w:val="single" w:sz="4" w:color="000000"/>
      <w:right w:val="single" w:sz="4" w:color="000000"/>
      <w:insideH w:val="single" w:sz="4" w:color="000000"/>
      <w:insideV w:val="single" w:sz="4" w:color="000000"/>
    </w:tblBorders>
    <w:jc w:val="center"/>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="500"/>
    <w:gridCol w:w="${r?"2500":"3500"}"/>
    <w:gridCol w:w="800"/>
    <w:gridCol w:w="1200"/>
    <w:gridCol w:w="1500"/>
    ${r?'<w:gridCol w:w="4000"/>':""}
  </w:tblGrid>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>№</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="${r?"2500":"3500"}" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>ФИО</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Кв.</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Площадь</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Голос</w:t></w:r></w:p>
    </w:tc>
    ${r?`<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Обоснование</w:t></w:r></w:p>
    </w:tc>`:""}
  </w:tr>`;return a.forEach((c,o)=>{const y=c.choice==="for"?"ЗА":c.choice==="against"?"ПРОТИВ":"ВОЗДЕРЖАЛСЯ",P=c.comment?.trim()||"";m+=`
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${o+1}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="${r?"2500":"3500"}" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${R(c.voter_name)}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${c.apartment_number||"-"}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${c.vote_weight?.toFixed(2)||"-"}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${y}</w:t></w:r></w:p>
    </w:tc>
    ${r?`<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:rPr><w:sz w:val="14"/><w:i/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="14"/><w:i/></w:rPr><w:t>${R(P)}</w:t></w:r></w:p>
    </w:tc>`:""}
  </w:tr>`}),m+="</w:tbl>",m}async function Ee(t){const{meeting:a,agendaItems:r,voteRecords:m,votesByItem:c}=t,o=a.buildingAddress||a.building_address||"Адрес не указан",y=$e(a.confirmed_date_time||a.voting_opened_at),P=Ce(a.confirmed_date_time||a.voting_opened_at),b=a.location||o,S=a.format==="online"?"заочной":a.format==="hybrid"?"очно-заочной":"очной",v=await Se(),h=new Map,g=new Map;for(let s=0;s<m.length;s++){const w=m[s],d=await Ae(w,a.number,o);h.set(w.voter_id,d),g.set(w.voter_id,`rId${200+s}`)}let N="";N+=`
<w:p><w:pPr><w:spacing w:before="200" w:after="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>1. Избрание Председателя и Секретаря собрания</w:t></w:r></w:p>
<w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>СЛУШАЛИ: Предложение об избрании Председателя и Секретаря собрания из числа присутствующих собственников помещений.</w:t></w:r></w:p>
<w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>ПРЕДЛОЖЕНО: Избрать Председателем собрания представителя УК, Секретарём - ${a.organizer_name||"представителя УК"}.</w:t></w:r></w:p>
<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>ГОЛОСОВАЛИ:</w:t></w:r></w:p>
${G({votesFor:a.voted_area,votesAgainst:0,votesAbstain:0,percentFor:100,percentAgainst:0,percentAbstain:0})}
<w:p><w:pPr><w:spacing w:before="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>РЕШЕНИЕ: Избрать Председателя и Секретаря собрания. Решение принято.</w:t></w:r></w:p>
`,r.forEach((s,w)=>{const d=Ie(s,a.total_area),x=w+2,k=d.percentFor>50,$=c[s.id]||[];N+=`
<w:p><w:pPr><w:spacing w:before="300" w:after="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>${x}. ${R(s.title)}</w:t></w:r></w:p>
${s.description?`<w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>СЛУШАЛИ: ${R(s.description)}</w:t></w:r></w:p>`:""}
<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>ГОЛОСОВАЛИ:</w:t></w:r></w:p>
${G(d)}
${qe(s,$)}
<w:p><w:pPr><w:spacing w:before="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>РЕШЕНИЕ: ${k?"Решение принято.":"Решение не принято."}</w:t></w:r></w:p>
`});const l=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <!-- Header -->
    <w:p><w:pPr><w:jc w:val="right"/><w:rPr><w:i/><w:sz w:val="20"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:i/><w:sz w:val="20"/></w:rPr><w:t>Закон РУз «Об управлении многоквартирными домами»</w:t></w:r></w:p>

    <!-- Title -->
    <w:p><w:pPr><w:spacing w:before="400" w:after="200"/><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>ПРОТОКОЛ № ${a.number}/${new Date().getFullYear()}</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>общего собрания собственников помещений</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>многоквартирного дома по адресу:</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>${R(o)}</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>проведённого в форме ${S} голосования</w:t></w:r></w:p>

    <!-- Meeting Info -->
    <w:p><w:pPr><w:spacing w:before="200"/><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Дата проведения: </w:t></w:r>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${y}</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Время: </w:t></w:r>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${P}</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Место проведения: </w:t></w:r>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${R(b)}</w:t></w:r></w:p>

    <!-- Quorum Info -->
    <w:p><w:pPr><w:spacing w:before="200"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>КВОРУМ:</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>Общая площадь помещений в доме: ${a.total_area.toFixed(2)} кв.м</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>Площадь помещений проголосовавших собственников: ${a.voted_area.toFixed(2)} кв.м</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>Процент участия: ${a.participation_percent.toFixed(1)}%</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>Количество проголосовавших: ${a.participated_count} из ${a.total_eligible_count} собственников</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="${a.quorum_reached?"008000":"FF0000"}"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="${a.quorum_reached?"008000":"FF0000"}"/></w:rPr><w:t>Кворум ${a.quorum_reached?"ИМЕЕТСЯ":"ОТСУТСТВУЕТ"} (требуется ${a.quorum_percent}%)</w:t></w:r></w:p>

    <!-- Agenda -->
    <w:p><w:pPr><w:spacing w:before="300" w:after="100"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>ПОВЕСТКА ДНЯ:</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>1. Избрание Председателя и Секретаря собрания</w:t></w:r></w:p>
    ${r.map((s,w)=>`
    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${w+2}. ${R(s.title)}</w:t></w:r></w:p>`).join("")}

    <!-- Agenda Items Content -->
    ${N}

    <!-- UK QR Code Signature -->
    <w:p><w:pPr><w:spacing w:before="400"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="900000" cy="900000"/><wp:docPr id="999" name="UK QR Code"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="uk_qr.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId100" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="900000" cy="900000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>Управляющая компания</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="18"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${E.name}</w:t></w:r></w:p>

    <!-- Appendix - Page Break -->
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>

    <!-- Appendix Header -->
    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>ПРИЛОЖЕНИЕ № 1</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>к Протоколу № ${a.number}/${new Date().getFullYear()}</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>РЕЕСТР УЧАСТНИКОВ ГОЛОСОВАНИЯ С ЭЛЕКТРОННЫМИ ПОДПИСЯМИ</w:t></w:r></w:p>

    <w:p><w:pPr><w:spacing w:before="200"/></w:pPr></w:p>

    ${Te(m,g)}

    <!-- Footer -->
    <w:p><w:pPr><w:spacing w:before="300"/><w:rPr><w:i/><w:sz w:val="18"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:i/><w:sz w:val="18"/></w:rPr><w:t>Протокол сформирован автоматически системой УК «KAMIZO»</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:i/><w:sz w:val="18"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:i/><w:sz w:val="18"/></w:rPr><w:t>Дата формирования: ${new Date().toLocaleString("ru-RU")}</w:t></w:r></w:p>

    ${t.protocolHash?`<w:p><w:pPr><w:rPr><w:i/><w:sz w:val="18"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:i/><w:sz w:val="18"/></w:rPr><w:t>Хеш документа: ${t.protocolHash}</w:t></w:r></w:p>`:""}

    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701"/>
    </w:sectPr>
  </w:body>
</w:document>`,p=new ue,z=X(v);p.file("word/media/uk_qr.png",z);for(const[s,w]of h){const d=X(w),x=m.findIndex(k=>k.voter_id===s);p.file(`word/media/voter_qr_${x}.png`,d)}let j=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId100" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/uk_qr.png"/>`;for(let s=0;s<m.length;s++)j+=`
  <Relationship Id="rId${200+s}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/voter_qr_${s}.png"/>`;j+=`
</Relationships>`,p.file("[Content_Types].xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`),p.file("_rels/.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`),p.file("word/_rels/document.xml.rels",j),p.file("word/document.xml",l);const _=p.generate({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}),f=`Протокол_${a.number}_${o.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g,"_")}.docx`;_e(_,f)}function er(){const{user:t}=ie(),{t:a,language:r}=ne(),{buildings:m,fetchBuildings:c}=oe(),{meetings:o,fetchMeetings:y,createMeeting:P,approveMeeting:b,rejectMeeting:S,confirmSchedule:v,openVoting:h,closeVoting:g,publishResults:N,generateProtocol:A,approveProtocol:l,deleteMeeting:p,calculateAgendaItemResult:z,calculateMeetingQuorum:j}=H();u.useEffect(()=>{y(),c()},[y,c]);const[_,f]=u.useState("all"),[s,w]=u.useState(!1),[d,x]=u.useState(null),[k,$]=u.useState(!1),U=u.useMemo(()=>{switch(_){case"active":return o.filter(n=>["schedule_poll_open","schedule_confirmed","voting_open"].includes(n.status));case"completed":return o.filter(n=>["voting_closed","results_published","protocol_generated","protocol_approved"].includes(n.status));case"pending":return o.filter(n=>["draft","pending_moderation"].includes(n.status));default:return o}},[o,_]),W=n=>D[n]?.color||"gray",O=n=>{const I=D[n];return r==="ru"?I?.label:I?.labelUz},B=n=>new Date(n).toLocaleDateString(r==="ru"?"ru-RU":"uz-UZ",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}),L=n=>{x(n),$(!0)},i=async n=>{confirm(r==="ru"?"Удалить собрание? Это действие необратимо.":"Yig'ilishni o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.")&&await p(n)},C=[{id:"all",label:r==="ru"?"Все":"Barchasi",count:o.length},{id:"active",label:r==="ru"?"Активные":"Faol",count:o.filter(n=>["schedule_poll_open","schedule_confirmed","voting_open"].includes(n.status)).length},{id:"pending",label:r==="ru"?"Ожидают":"Kutmoqda",count:o.filter(n=>["draft","pending_moderation"].includes(n.status)).length},{id:"completed",label:r==="ru"?"Завершены":"Tugallangan",count:o.filter(n=>["voting_closed","results_published","protocol_generated","protocol_approved"].includes(n.status)).length}];return e.jsxs("div",{className:"space-y-6",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"text-2xl font-bold text-gray-900",children:a("meetings.title")}),e.jsx("p",{className:"text-gray-500",children:a("meetings.subtitle")})]}),e.jsxs("button",{onClick:()=>w(!0),className:"btn-primary flex items-center gap-2",children:[e.jsx(Z,{className:"w-5 h-5"}),a("meetings.create")]})]}),e.jsx("div",{className:"flex gap-2 flex-wrap",children:C.map(n=>e.jsxs("button",{onClick:()=>f(n.id),className:`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${_===n.id?"bg-primary-400 text-gray-900":"bg-white text-gray-600 hover:bg-gray-100"}`,children:[n.label,n.count>0&&e.jsx("span",{className:"ml-1 px-2 py-0.5 rounded-full bg-gray-900/10 text-xs",children:n.count})]},n.id))}),e.jsx("div",{className:"space-y-4",children:U.length===0?e.jsxs("div",{className:"glass-card p-12 text-center",children:[e.jsx(K,{className:"w-16 h-16 mx-auto text-gray-300 mb-4"}),e.jsx("h3",{className:"text-lg font-medium text-gray-600 mb-2",children:a("meetings.noMeetings")}),e.jsx("p",{className:"text-gray-400",children:a("meetings.createFirst")})]}):U.map(n=>e.jsx(Re,{meeting:n,language:r,getStatusColor:W,getStatusLabel:O,formatDate:B,onViewDetails:()=>L(n),onApprove:()=>b(n.id),onReject:I=>S(n.id,I),onConfirmSchedule:()=>v(n.id),onOpenVoting:()=>h(n.id),onCloseVoting:()=>g(n.id),onPublishResults:()=>N(n.id),onGenerateProtocol:()=>A(n.id),onApproveProtocol:()=>l(n.id),onDelete:()=>i(n.id),calculateQuorum:()=>j(n.id),user:t},n.id))}),s&&e.jsx(De,{onClose:()=>w(!1),onCreate:async n=>{try{await P(n),await y(),w(!1)}catch{}},language:r,user:t,buildings:m.map(n=>({id:n.id,name:n.name,address:n.address}))}),k&&d&&e.jsx(Fe,{meeting:d,onClose:()=>{$(!1),x(null)},language:r,calculateResult:z,calculateQuorum:()=>j(d.id)})]})}function Re({meeting:t,language:a,getStatusColor:r,getStatusLabel:m,formatDate:c,onViewDetails:o,onApprove:y,onReject:P,onConfirmSchedule:b,onOpenVoting:S,onCloseVoting:v,onPublishResults:h,onGenerateProtocol:g,onApproveProtocol:N,onDelete:A,calculateQuorum:l,user:p}){const z=l(),j=r(t.status),_={gray:"bg-gray-100 text-gray-700",yellow:"bg-yellow-100 text-orange-700",blue:"bg-blue-100 text-blue-700",indigo:"bg-indigo-100 text-indigo-700",green:"bg-green-100 text-green-700",orange:"bg-orange-100 text-orange-700",purple:"bg-purple-100 text-purple-700",teal:"bg-teal-100 text-teal-700",emerald:"bg-emerald-100 text-emerald-700",red:"bg-red-100 text-red-700"};return e.jsxs("div",{className:"glass-card p-5 hover:shadow-lg transition-shadow",children:[e.jsxs("div",{className:"flex items-start justify-between gap-4",children:[e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsxs("div",{className:"flex items-center gap-3 mb-3 flex-wrap",children:[e.jsx("span",{className:`px-3 py-1 rounded-lg text-sm font-medium ${_[j]||_.gray}`,children:m(t.status)}),e.jsxs("span",{className:"text-sm text-gray-500",children:["#",t.number]}),e.jsx("span",{className:`px-2 py-0.5 rounded text-xs font-medium ${t.format==="online"?"bg-blue-50 text-blue-600":t.format==="offline"?"bg-green-50 text-green-600":"bg-purple-50 text-purple-600"}`,children:t.format==="online"?a==="ru"?"Онлайн":"Onlayn":t.format==="offline"?a==="ru"?"Очное":"Yuzma-yuz":a==="ru"?"Смешанное":"Aralash"})]}),e.jsxs("div",{className:"flex items-center gap-4 text-sm text-gray-600 mb-2 overflow-hidden",children:[e.jsxs("span",{className:"flex items-center gap-1 truncate min-w-0",children:[e.jsx(J,{className:"w-4 h-4 flex-shrink-0"}),e.jsx("span",{className:"truncate",children:t.buildingAddress})]}),t.confirmedDateTime&&e.jsxs("span",{className:"flex items-center gap-1",children:[e.jsx(Y,{className:"w-4 h-4"}),c(t.confirmedDateTime)]})]}),e.jsxs("div",{className:"flex items-center gap-2 text-sm text-gray-500 mb-3 min-w-0",children:[e.jsx(ee,{className:"w-4 h-4 flex-shrink-0"}),e.jsx("span",{className:"truncate",children:t.organizerName}),e.jsxs("span",{className:"text-gray-400",children:["(",t.organizerType==="resident"?a==="ru"?"Житель":"Aholi":a==="ru"?"УК":"UK",")"]})]}),e.jsxs("div",{className:"flex items-center gap-2 text-sm",children:[e.jsx(M,{className:"w-4 h-4 text-gray-400"}),e.jsxs("span",{className:"text-gray-600",children:[t.agendaItems.length," ",a==="ru"?"вопросов в повестке":"savol kun tartibida"]})]}),t.status==="schedule_poll_open"&&t.scheduleOptions&&t.scheduleOptions.length>0&&e.jsxs("div",{className:"mt-3 pt-3 border-t border-gray-100",children:[e.jsxs("div",{className:"text-sm font-medium text-gray-700 mb-2 flex items-center gap-2",children:[e.jsx(Y,{className:"w-4 h-4 text-blue-500"}),a==="ru"?"Голосование за дату:":"Sana uchun ovoz berish:"]}),e.jsx("div",{className:"space-y-1",children:t.scheduleOptions.map(f=>{const s=t.scheduleOptions.reduce((k,$)=>k+($.voteCount??$.votes?.length??0),0),w=f.voteCount??f.votes?.length??0,d=s>0?w/s*100:0,x=w>0&&w===Math.max(...t.scheduleOptions.map(k=>k.voteCount??k.votes?.length??0));return e.jsxs("div",{className:"flex items-center gap-2 text-sm",children:[e.jsxs("div",{className:`flex-1 flex items-center gap-2 ${x?"font-medium text-blue-700":"text-gray-600"}`,children:[e.jsx("span",{children:c(f.dateTime)}),x&&w>0&&e.jsx("span",{className:"text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded",children:a==="ru"?"Лидер":"Yetakchi"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("div",{className:"w-20 h-2 bg-gray-100 rounded-full overflow-hidden",children:e.jsx("div",{className:"h-full bg-blue-500 rounded-full transition-all",style:{width:`${d}%`}})}),e.jsxs("span",{className:"text-xs text-gray-500 w-12 text-right",children:[w," (",d.toFixed(0),"%)"]})]})]},f.id)})}),e.jsxs("div",{className:"text-xs text-gray-400 mt-2",children:[a==="ru"?"Всего голосов: ":"Jami ovozlar: ",t.scheduleOptions.reduce((f,s)=>f+(s.voteCount??s.votes?.length??0),0)]})]}),["voting_open","voting_closed","results_published","protocol_generated","protocol_approved"].includes(t.status)&&e.jsxs("div",{className:"flex items-center gap-4 mt-3 pt-3 border-t border-gray-100",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(K,{className:"w-4 h-4 text-gray-400"}),e.jsxs("span",{className:"text-sm",children:[z.participated,"/",z.total," (",z.percent.toFixed(1),"%)"]})]}),e.jsx("span",{className:`text-xs px-2 py-0.5 rounded-full font-medium ${z.quorumReached?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`,children:z.quorumReached?a==="ru"?"Кворум есть":"Kvorum bor":a==="ru"?"Нет кворума":"Kvorum yo'q"})]})]}),e.jsxs("div",{className:"flex flex-col gap-2",children:[e.jsx("button",{onClick:o,className:"p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors",title:a==="ru"?"Подробнее":"Batafsil",children:e.jsx(ce,{className:"w-5 h-5"})}),t.status==="pending_moderation"&&(p?.role==="admin"||p?.role==="manager"||p?.role==="director")&&e.jsxs(e.Fragment,{children:[e.jsx("button",{onClick:y,className:"p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors",title:a==="ru"?"Одобрить":"Tasdiqlash",children:e.jsx(re,{className:"w-5 h-5"})}),e.jsx("button",{onClick:()=>P(a==="ru"?"Отклонено модератором":"Moderator tomonidan rad etildi"),className:"p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors",title:a==="ru"?"Отклонить":"Rad etish",children:e.jsx(F,{className:"w-5 h-5"})})]}),(p?.role==="admin"||p?.role==="manager"||p?.role==="director")&&e.jsx("button",{onClick:A,className:"p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors",title:a==="ru"?"Удалить":"O'chirish",children:e.jsx(ve,{className:"w-5 h-5"})})]})]}),(p?.role==="admin"||p?.role==="manager"||p?.role==="director")&&e.jsxs("div",{className:"mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2",children:[t.status==="schedule_poll_open"&&e.jsxs("button",{onClick:b,className:"flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm font-medium",children:[e.jsx(ze,{className:"w-4 h-4"}),a==="ru"?"Подтвердить дату":"Sanani tasdiqlash"]}),t.status==="schedule_confirmed"&&e.jsxs("button",{onClick:S,className:"flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm font-medium",children:[e.jsx(ge,{className:"w-4 h-4"}),a==="ru"?"Открыть голосование":"Ovoz berishni ochish"]}),t.status==="voting_open"&&e.jsxs("button",{onClick:v,className:"flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm font-medium",children:[e.jsx(Pe,{className:"w-4 h-4"}),a==="ru"?"Закрыть голосование":"Ovoz berishni yopish"]}),t.status==="voting_closed"&&e.jsxs("button",{onClick:h,className:"flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors text-sm font-medium",children:[e.jsx(de,{className:"w-4 h-4"}),a==="ru"?"Опубликовать итоги":"Natijalarni e'lon qilish"]}),t.status==="results_published"&&e.jsxs("button",{onClick:g,className:"flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-colors text-sm font-medium",children:[e.jsx(M,{className:"w-4 h-4"}),a==="ru"?"Сформировать протокол":"Bayonnoma yaratish"]}),t.status==="protocol_generated"&&e.jsxs("button",{onClick:N,className:"flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors text-sm font-medium",children:[e.jsx(me,{className:"w-4 h-4"}),a==="ru"?"Подписать протокол":"Bayonnomani imzolash"]}),t.status==="protocol_approved"&&e.jsxs("button",{onClick:o,className:"flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium",children:[e.jsx(ae,{className:"w-4 h-4"}),a==="ru"?"Скачать протокол":"Bayonnomani yuklab olish"]})]})]})}function De({onClose:t,onCreate:a,language:r,user:m,buildings:c}){const[o,y]=u.useState(1),[P,b]=u.useState(!1),[S,v]=u.useState(!1),[h,g]=u.useState({title:"",description:"",threshold:"simple_majority",attachments:[]}),[N,A]=u.useState(!1),[l,p]=u.useState({buildingId:m?.buildingId||(c.length>0?c[0].id:""),buildingAddress:c.length>0?c[0].address:"",organizerType:"management",format:"online",agendaItems:[],customItems:[],location:"",description:"",meetingTime:"19:00"}),z=s=>{const w=c.find(d=>d.id===s);p({...l,buildingId:s,buildingAddress:w?.address||""})},j=s=>{l.agendaItems.includes(s)?p({...l,agendaItems:l.agendaItems.filter(w=>w!==s)}):p({...l,agendaItems:[...l.agendaItems,s]})},_=async()=>{if(!m||!l.buildingId||P)return;b(!0);const s=[...l.agendaItems.map(w=>({type:w,title:r==="ru"?T[w].label:T[w].labelUz,description:r==="ru"?T[w].description:T[w].descriptionUz,threshold:T[w].defaultThreshold,materials:[]})),...l.customItems.map(w=>({type:"other",title:w.title,description:w.description,threshold:w.threshold,materials:[],attachments:w.attachments}))];try{await a({buildingId:l.buildingId,buildingAddress:l.buildingAddress,organizerType:l.organizerType,organizerId:m.id,organizerName:m.name,format:l.format,agendaItems:s,location:l.location||void 0,description:l.description||void 0,meetingTime:l.meetingTime||"19:00"})}finally{b(!1)}},f=[{num:1,label:r==="ru"?"Тип":"Turi"},{num:2,label:r==="ru"?"Повестка":"Kun tartibi"},{num:3,label:r==="ru"?"Публикация":"Nashr"}];return e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4",children:e.jsxs("div",{className:"bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto",children:[e.jsxs("div",{className:"p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("h2",{className:"text-base sm:text-lg md:text-xl font-bold",children:r==="ru"?"Созвать собрание":"Yig'ilish chaqirish"}),e.jsx("p",{className:"text-sm text-gray-500",children:r==="ru"?`Шаг ${o} из 3`:`Bosqich ${o} dan 3`})]}),e.jsx("button",{onClick:t,className:"p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors touch-manipulation",children:e.jsx(F,{className:"w-5 h-5"})})]}),e.jsx("div",{className:"px-6 py-4 border-b border-gray-100",children:e.jsx("div",{className:"flex items-center justify-between",children:f.map((s,w)=>e.jsxs("div",{className:"flex items-center",children:[e.jsx("div",{className:`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${o>=s.num?"bg-primary-400 text-gray-900":"bg-gray-200 text-gray-500"}`,children:s.num}),e.jsx("span",{className:`ml-2 text-sm ${o>=s.num?"text-gray-900":"text-gray-500"}`,children:s.label}),w<f.length-1&&e.jsx("div",{className:`w-16 h-1 mx-4 rounded ${o>s.num?"bg-primary-400":"bg-gray-200"}`})]},s.num))})}),e.jsxs("div",{className:"p-6 space-y-6",children:[o===1&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-3",children:r==="ru"?"Выберите дом":"Uyni tanlang"}),c.length===0?e.jsx("div",{className:"p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800",children:r==="ru"?"Нет доступных домов. Сначала добавьте дом в системе.":"Mavjud uylar yo'q. Avval tizimda uy qo'shing."}):e.jsx("select",{value:l.buildingId,onChange:s=>z(s.target.value),className:"w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-400 focus:border-primary-400",children:c.map(s=>e.jsxs("option",{value:s.id,children:[s.name," - ",s.address]},s.id))})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-3",children:r==="ru"?"Организатор":"Tashkilotchi"}),e.jsxs("div",{className:"grid grid-cols-2 gap-3",children:[e.jsxs("button",{onClick:()=>p({...l,organizerType:"management"}),className:`p-4 rounded-xl border-2 transition-colors ${l.organizerType==="management"?"border-primary-400 bg-primary-50":"border-gray-200 hover:border-gray-300"}`,children:[e.jsx(J,{className:"w-6 h-6 mb-2 mx-auto text-gray-600"}),e.jsx("div",{className:"text-sm font-medium",children:r==="ru"?"Управляющая компания":"Boshqaruv kompaniyasi"})]}),e.jsxs("button",{onClick:()=>p({...l,organizerType:"resident"}),className:`p-4 rounded-xl border-2 transition-colors ${l.organizerType==="resident"?"border-primary-400 bg-primary-50":"border-gray-200 hover:border-gray-300"}`,children:[e.jsx(ee,{className:"w-6 h-6 mb-2 mx-auto text-gray-600"}),e.jsx("div",{className:"text-sm font-medium",children:r==="ru"?"Житель (инициатива)":"Aholi (tashabbusi)"})]})]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-3",children:r==="ru"?"Формат проведения":"O'tkazish formati"}),e.jsx("div",{className:"grid grid-cols-3 gap-3",children:["online","offline","hybrid"].map(s=>e.jsx("button",{onClick:()=>p({...l,format:s}),className:`p-3 rounded-xl border-2 transition-colors ${l.format===s?"border-primary-400 bg-primary-50":"border-gray-200 hover:border-gray-300"}`,children:e.jsx("div",{className:"text-sm font-medium",children:s==="online"?r==="ru"?"Онлайн":"Onlayn":s==="offline"?r==="ru"?"Очное":"Yuzma-yuz":r==="ru"?"Смешанное":"Aralash"})},s))})]}),l.format!=="online"&&e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:r==="ru"?"Место проведения":"O'tkazish joyi"}),e.jsx("input",{type:"text",value:l.location,onChange:s=>p({...l,location:s.target.value}),className:"glass-input",placeholder:r==="ru"?"Например: Холл 1 этажа":"Masalan: 1-qavat zali"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:r==="ru"?"Время проведения":"O'tkazish vaqti"}),e.jsx("input",{type:"time",value:l.meetingTime,onChange:s=>p({...l,meetingTime:s.target.value}),className:"glass-input"}),e.jsx("p",{className:"text-xs text-gray-500 mt-1",children:r==="ru"?"Время для всех вариантов дат в голосовании":"Ovoz berishdagi barcha sanalar uchun vaqt"})]}),e.jsxs("div",{children:[e.jsxs("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:[r==="ru"?"Обоснование собрания":"Yig'ilish asoslashi",e.jsxs("span",{className:"text-gray-400 font-normal ml-1",children:["(",r==="ru"?"необязательно":"ixtiyoriy",")"]})]}),e.jsx("textarea",{value:l.description,onChange:s=>p({...l,description:s.target.value}),className:"glass-input min-h-[80px] resize-none",placeholder:r==="ru"?"Опишите причину созыва собрания и что планируется обсудить...":"Yig'ilish sababi va nimalar muhokama qilinishini tasvirlang...",rows:3})]})]}),o===2&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-3",children:r==="ru"?"Выберите вопросы повестки":"Kun tartibi savollarini tanlang"}),e.jsx("div",{className:"space-y-2 max-h-96 overflow-y-auto",children:Object.keys(T).map(s=>{const w=T[s],d=l.agendaItems.includes(s);return e.jsx("button",{onClick:()=>j(s),className:`w-full p-4 rounded-xl border-2 text-left transition-colors ${d?"border-primary-400 bg-primary-50":"border-gray-200 hover:border-gray-300"}`,children:e.jsxs("div",{className:"flex items-start justify-between",children:[e.jsxs("div",{children:[e.jsx("div",{className:"font-medium",children:r==="ru"?w.label:w.labelUz}),e.jsx("div",{className:"text-sm text-gray-500 mt-1",children:r==="ru"?w.description:w.descriptionUz}),e.jsxs("div",{className:"flex items-center gap-2 mt-2",children:[e.jsx("span",{className:"text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600",children:r==="ru"?q[w.defaultThreshold].label:q[w.defaultThreshold].labelUz}),w.requiresMaterials&&e.jsx("span",{className:"text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-600",children:r==="ru"?"Нужны материалы":"Materiallar kerak"})]})]}),e.jsx("div",{className:`w-6 h-6 rounded-full border-2 flex items-center justify-center ${d?"border-primary-400 bg-primary-400":"border-gray-300"}`,children:d&&e.jsx(re,{className:"w-4 h-4 text-gray-900"})})]})},s)})})]}),e.jsxs("div",{className:"mt-6 pt-6 border-t border-gray-200",children:[e.jsxs("div",{className:"flex items-center justify-between mb-3",children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700",children:r==="ru"?"Свои вопросы":"O'z savollaringiz"}),e.jsxs("button",{type:"button",onClick:()=>v(!0),className:"text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1",children:[e.jsx(Z,{className:"w-4 h-4"}),r==="ru"?"Добавить вопрос":"Savol qo'shish"]})]}),l.customItems.length>0&&e.jsx("div",{className:"space-y-2 mb-4",children:l.customItems.map((s,w)=>e.jsx("div",{className:"p-3 rounded-xl border-2 border-primary-400 bg-primary-50",children:e.jsxs("div",{className:"flex items-start justify-between",children:[e.jsxs("div",{className:"flex-1",children:[e.jsx("div",{className:"font-medium",children:s.title}),s.description&&e.jsx("div",{className:"text-sm text-gray-500 mt-1",children:s.description}),e.jsx("span",{className:"text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 mt-2 inline-block",children:r==="ru"?q[s.threshold].label:q[s.threshold].labelUz}),s.attachments&&s.attachments.length>0&&e.jsx("div",{className:"flex flex-wrap gap-2 mt-2",children:s.attachments.map((d,x)=>e.jsx("div",{className:"flex items-center gap-1",children:d.type.startsWith("image/")?e.jsx("img",{src:d.url,alt:d.name,className:"w-12 h-12 object-cover rounded border border-gray-200"}):e.jsxs("div",{className:"flex items-center gap-1 px-2 py-1 bg-white rounded border border-gray-200 text-xs text-gray-600",children:[e.jsx(M,{className:"w-3 h-3"}),e.jsx("span",{className:"max-w-[80px] truncate",children:d.name})]})},x))})]}),e.jsx("button",{onClick:()=>p({...l,customItems:l.customItems.filter((d,x)=>x!==w)}),className:"p-1 text-red-500 hover:bg-red-50 rounded",children:e.jsx(F,{className:"w-4 h-4"})})]})},w))}),S&&e.jsxs("div",{className:"p-4 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 space-y-3",children:[e.jsx("input",{type:"text",value:h.title,onChange:s=>g({...h,title:s.target.value}),className:"glass-input",placeholder:r==="ru"?"Название вопроса *":"Savol nomi *"}),e.jsx("textarea",{value:h.description,onChange:s=>g({...h,description:s.target.value}),className:"glass-input min-h-[60px] resize-none",placeholder:r==="ru"?"Описание (необязательно)":"Tavsif (ixtiyoriy)",rows:2}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs text-gray-500 mb-1",children:r==="ru"?"Порог принятия":"Qabul qilish chegarasi"}),e.jsx("select",{value:h.threshold,onChange:s=>g({...h,threshold:s.target.value}),className:"glass-input text-sm",children:Object.keys(q).map(s=>e.jsx("option",{value:s,children:r==="ru"?q[s].label:q[s].labelUz},s))})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs text-gray-500 mb-2",children:r==="ru"?"Прикреплённые файлы":"Ilova qilingan fayllar"}),h.attachments.length>0&&e.jsx("div",{className:"flex flex-wrap gap-2 mb-2",children:h.attachments.map((s,w)=>e.jsx("div",{className:"relative group",children:s.type.startsWith("image/")?e.jsxs("div",{className:"relative",children:[e.jsx("img",{src:s.url,alt:s.name,className:"w-16 h-16 object-cover rounded border border-gray-200"}),e.jsx("button",{type:"button",onClick:()=>g({...h,attachments:h.attachments.filter((d,x)=>x!==w)}),className:"absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity",children:e.jsx(F,{className:"w-3 h-3"})})]}):e.jsxs("div",{className:"flex items-center gap-1 pl-2 pr-1 py-1 bg-white rounded-lg border border-gray-200 text-xs text-gray-700",children:[e.jsx(M,{className:"w-4 h-4 text-gray-400 flex-shrink-0"}),e.jsx("span",{className:"max-w-[100px] truncate",children:s.name}),e.jsx("button",{type:"button",onClick:()=>g({...h,attachments:h.attachments.filter((d,x)=>x!==w)}),className:"ml-1 text-red-400 hover:text-red-600 flex-shrink-0",children:e.jsx(F,{className:"w-3 h-3"})})]})},w))}),e.jsxs("label",{className:`inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 bg-white text-sm text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors ${N?"opacity-50 pointer-events-none":""}`,children:[N?e.jsx(pe,{className:"w-4 h-4 animate-spin"}):e.jsx(fe,{className:"w-4 h-4"}),r==="ru"?"Прикрепить файл":"Fayl biriktirish",e.jsx("input",{type:"file",className:"hidden",accept:"image/*,.pdf,.doc,.docx,.xlsx",disabled:N,onChange:async s=>{const w=s.target.files?.[0];if(w){A(!0);try{const d=await be.uploadFile(w);g(x=>({...x,attachments:[...x.attachments,d]}))}catch{const d=new FileReader;d.onload=x=>{const k=x.target?.result;g($=>({...$,attachments:[...$.attachments,{name:w.name,url:k,type:w.type,size:w.size}]}))},d.readAsDataURL(w)}finally{A(!1),s.target.value=""}}}})]})]}),e.jsxs("div",{className:"flex gap-2",children:[e.jsx("button",{type:"button",onClick:()=>{h.title.trim()&&(p({...l,customItems:[...l.customItems,{...h}]}),g({title:"",description:"",threshold:"simple_majority",attachments:[]}),v(!1))},disabled:!h.title.trim()||N,className:"flex-1 py-2 px-4 bg-primary-400 hover:bg-primary-500 text-gray-900 rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed",children:r==="ru"?"Добавить":"Qo'shish"}),e.jsx("button",{type:"button",onClick:()=>{v(!1),g({title:"",description:"",threshold:"simple_majority",attachments:[]})},className:"py-2 px-4 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium text-sm",children:r==="ru"?"Отмена":"Bekor qilish"})]})]})]}),l.agendaItems.length===0&&l.customItems.length===0&&e.jsx("p",{className:"text-sm text-red-500",children:r==="ru"?"Выберите хотя бы один вопрос или добавьте свой":"Kamida bitta savol tanlang yoki o'zingiznikini qo'shing"})]}),o===3&&e.jsx(e.Fragment,{children:e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"p-4 rounded-xl bg-gray-50",children:[e.jsx("h3",{className:"font-medium mb-3",children:r==="ru"?"Сводка":"Xulosa"}),e.jsxs("div",{className:"space-y-2 text-sm",children:[e.jsxs("div",{className:"flex justify-between",children:[e.jsx("span",{className:"text-gray-500",children:r==="ru"?"Формат:":"Format:"}),e.jsx("span",{className:"font-medium",children:l.format==="online"?r==="ru"?"Онлайн":"Onlayn":l.format==="offline"?r==="ru"?"Очное":"Yuzma-yuz":r==="ru"?"Смешанное":"Aralash"})]}),e.jsxs("div",{className:"flex justify-between",children:[e.jsx("span",{className:"text-gray-500",children:r==="ru"?"Дом:":"Uy:"}),e.jsx("span",{className:"font-medium",children:c.find(s=>s.id===l.buildingId)?.name||l.buildingAddress})]}),e.jsxs("div",{className:"flex justify-between",children:[e.jsx("span",{className:"text-gray-500",children:r==="ru"?"Организатор:":"Tashkilotchi:"}),e.jsx("span",{className:"font-medium",children:l.organizerType==="management"?r==="ru"?"УК":"UK":r==="ru"?"Житель":"Aholi"})]}),e.jsxs("div",{className:"flex justify-between",children:[e.jsx("span",{className:"text-gray-500",children:r==="ru"?"Вопросов:":"Savollar:"}),e.jsx("span",{className:"font-medium",children:l.agendaItems.length})]})]})]}),e.jsx("div",{className:"p-4 rounded-xl bg-blue-50 border border-blue-200",children:e.jsxs("div",{className:"flex items-start gap-3",children:[e.jsx(te,{className:"w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5"}),e.jsx("div",{className:"text-sm text-blue-700",children:r==="ru"?"После публикации жильцам будет отправлено уведомление. Они смогут проголосовать за удобную дату проведения собрания.":"Nashrdan so'ng aholiga bildirishnoma yuboriladi. Ular yig'ilish uchun qulay sanani tanlashlari mumkin bo'ladi."})]})}),e.jsxs("div",{className:"p-4 rounded-xl bg-yellow-50 border border-yellow-200",children:[e.jsx("h4",{className:"font-medium mb-2",children:r==="ru"?"Повестка дня:":"Kun tartibi:"}),e.jsxs("ol",{className:"list-decimal list-inside space-y-1 text-sm",children:[l.agendaItems.map(s=>e.jsx("li",{children:r==="ru"?T[s].label:T[s].labelUz},s)),l.customItems.map((s,w)=>e.jsxs("li",{className:"text-blue-700",children:[s.title,e.jsxs("span",{className:"text-xs text-gray-500 ml-1",children:["(",r==="ru"?"свой вопрос":"o'z savoli",")"]})]},`custom-${w}`))]})]}),l.description&&e.jsxs("div",{className:"p-4 rounded-xl bg-gray-50 border border-gray-200",children:[e.jsx("h4",{className:"font-medium mb-2",children:r==="ru"?"Обоснование:":"Asoslash:"}),e.jsx("p",{className:"text-sm text-gray-600",children:l.description})]})]})})]}),e.jsxs("div",{className:"p-6 border-t border-gray-100 flex gap-3",children:[o>1&&e.jsx("button",{onClick:()=>y(o-1),disabled:P,className:"flex-1 py-3 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50",children:r==="ru"?"Назад":"Orqaga"}),o<3?e.jsx("button",{onClick:()=>y(o+1),disabled:o===1&&!l.buildingId||o===2&&l.agendaItems.length===0&&l.customItems.length===0,className:"flex-1 py-3 rounded-xl font-medium bg-primary-400 text-gray-900 hover:bg-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",children:r==="ru"?"Далее":"Keyingi"}):e.jsx("button",{onClick:_,disabled:P||!l.buildingId,className:"flex-1 py-3 rounded-xl font-medium bg-primary-400 text-gray-900 hover:bg-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",children:P?r==="ru"?"Создание...":"Yaratilmoqda...":r==="ru"?"Опубликовать":"Nashr qilish"})]})]})})}function Fe({meeting:t,onClose:a,language:r,calculateResult:m,calculateQuorum:c}){const o=c(),[y,P]=u.useState(!1),[b,S]=u.useState("agenda"),[v,h]=u.useState(null),[g,N]=u.useState([]),[A,l]=u.useState(!1),[p,z]=u.useState(null),[j,_]=u.useState(null),[f,s]=u.useState(""),[w,d]=u.useState(""),[x,k]=u.useState(null),{fetchAgainstVotes:$,sendReconsiderationRequest:U,fetchReconsiderationStats:W}=H();u.useEffect(()=>{b==="against"&&v&&(l(!0),$(t.id,v).then(i=>{N(i),l(!1)}))},[b,v,t.id,$]),u.useEffect(()=>{b==="against"&&W(t.id).then(i=>{k(i)})},[b,t.id,W]),u.useEffect(()=>{b==="against"&&!v&&t.agendaItems.length>0&&h(t.agendaItems[0].id)},[b,v,t.agendaItems]);const O=async()=>{if(!j||!v||!f)return;z(j.voterId);const i=await U(t.id,{agendaItemId:v,residentId:j.voterId,reason:f,messageToResident:w||void 0});if(i.success){const C=await $(t.id,v);N(C),_(null),s(""),d("")}else alert(i.error||(r==="ru"?"Ошибка при отправке запроса":"So'rovni yuborishda xatolik"));z(null)},B=[{value:"discussed_personally",label:r==="ru"?"Обсудили лично":"Shaxsan muhokama qildik"},{value:"new_information",label:r==="ru"?"Появилась новая информация":"Yangi ma'lumot paydo bo'ldi"},{value:"clarification_needed",label:r==="ru"?"Требуется уточнение":"Aniqlik kiritish kerak"},{value:"other",label:r==="ru"?"Другое":"Boshqa"}],L=async()=>{P(!0);try{const i=await fetch(`/api/meetings/${t.id}/protocol/data`);if(!i.ok)throw new Error("Failed to fetch protocol data");const C=await i.json();await Ee({meeting:{...C.meeting,buildingAddress:t.buildingAddress||C.meeting.building_address},agendaItems:C.agendaItems,voteRecords:C.voteRecords,votesByItem:C.votesByItem,protocolHash:C.protocolHash})}catch{alert(r==="ru"?"Ошибка при скачивании протокола":"Bayonnomani yuklashda xato")}finally{P(!1)}};return e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4",children:e.jsxs("div",{className:"bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto",children:[e.jsxs("div",{className:"p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("h2",{className:"text-base sm:text-lg md:text-xl font-bold",children:r==="ru"?`Собрание #${t.number}`:`Yig'ilish #${t.number}`}),e.jsx("p",{className:"text-sm text-gray-500",children:t.buildingAddress})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[["protocol_generated","protocol_approved"].includes(t.status)&&e.jsxs("button",{onClick:L,disabled:y,className:"flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition-colors disabled:opacity-50",children:[e.jsx(ae,{className:"w-4 h-4"}),y?r==="ru"?"Загрузка...":"Yuklanmoqda...":r==="ru"?"Скачать протокол":"Bayonnomani yuklab olish"]}),e.jsx("button",{onClick:a,className:"p-2 hover:bg-gray-100 rounded-xl transition-colors",children:e.jsx(F,{className:"w-5 h-5"})})]})]}),e.jsxs("div",{className:"p-6 space-y-6",children:[e.jsxs("div",{className:"flex items-center gap-4 flex-wrap",children:[e.jsx("span",{className:`px-3 py-1 rounded-lg text-sm font-medium ${D[t.status]?.color==="green"?"bg-green-100 text-green-700":D[t.status]?.color==="blue"?"bg-blue-100 text-blue-700":D[t.status]?.color==="yellow"?"bg-yellow-100 text-orange-700":"bg-gray-100 text-gray-700"}`,children:r==="ru"?D[t.status]?.label:D[t.status]?.labelUz}),t.status!=="draft"&&t.status!=="pending_moderation"&&e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(K,{className:"w-4 h-4 text-gray-400"}),e.jsxs("span",{className:"text-sm",children:[o.participated,"/",o.total," (",o.percent.toFixed(1),"%)"]}),e.jsx("span",{className:`text-xs px-2 py-0.5 rounded-full font-medium ${o.quorumReached?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`,children:o.quorumReached?r==="ru"?"Кворум":"Kvorum":r==="ru"?"Нет кворума":"Kvorum yo'q"})]})]}),t.confirmedDateTime&&e.jsxs("div",{className:"flex items-center gap-2 text-gray-600",children:[e.jsx(Y,{className:"w-5 h-5"}),e.jsx("span",{children:new Date(t.confirmedDateTime).toLocaleDateString(r==="ru"?"ru-RU":"uz-UZ",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})})]}),t.status==="voting_open"&&e.jsxs("div",{className:"flex gap-2 border-b border-gray-200",children:[e.jsx("button",{onClick:()=>S("agenda"),className:`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${b==="agenda"?"border-primary-500 text-primary-600":"border-transparent text-gray-500 hover:text-gray-700"}`,children:r==="ru"?"Повестка дня":"Kun tartibi"}),e.jsxs("button",{onClick:()=>S("against"),className:`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${b==="against"?"border-primary-500 text-primary-600":"border-transparent text-gray-500 hover:text-gray-700"}`,children:[e.jsx(Q,{className:"w-4 h-4"}),r==="ru"?"Голоса против":"Qarshi ovozlar"]})]}),b==="against"&&t.status==="voting_open"&&e.jsxs("div",{className:"space-y-4",children:[x&&x.total>0&&e.jsxs("div",{className:"p-3 bg-blue-50 rounded-xl",children:[e.jsx("div",{className:"text-sm font-medium text-blue-800 mb-2",children:r==="ru"?"Статистика запросов на пересмотр":"Qayta ko'rib chiqish so'rovlari statistikasi"}),e.jsxs("div",{className:"grid grid-cols-3 gap-2 text-xs",children:[e.jsxs("div",{children:[e.jsx("span",{className:"text-blue-600",children:r==="ru"?"Отправлено:":"Yuborildi:"})," ",x.total]}),e.jsxs("div",{children:[e.jsx("span",{className:"text-green-600",children:r==="ru"?"Изменили:":"O'zgartirildi:"})," ",x.voteChanged]}),e.jsxs("div",{children:[e.jsx("span",{className:"text-gray-600",children:r==="ru"?"Конверсия:":"Konversiya:"})," ",x.conversionRate,"%"]})]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:r==="ru"?"Выберите вопрос:":"Savolni tanlang:"}),e.jsx("select",{value:v||"",onChange:i=>h(i.target.value),className:"w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent",children:t.agendaItems.map((i,C)=>e.jsxs("option",{value:i.id,children:[C+1,". ",i.title]},i.id))})]}),A?e.jsx("div",{className:"text-center py-8 text-gray-500",children:r==="ru"?"Загрузка...":"Yuklanmoqda..."}):g.length===0?e.jsx("div",{className:"text-center py-8 text-gray-500",children:r==="ru"?"Нет голосов против по этому вопросу":"Bu savol bo'yicha qarshi ovozlar yo'q"}):e.jsx("div",{className:"space-y-3",children:g.map(i=>e.jsx("div",{className:"p-4 bg-gray-50 rounded-xl border border-gray-200",children:e.jsxs("div",{className:"flex items-start justify-between gap-4",children:[e.jsxs("div",{className:"flex-1",children:[e.jsx("div",{className:"font-medium",children:i.voterName}),e.jsxs("div",{className:"text-sm text-gray-500 flex items-center gap-4",children:[e.jsxs("span",{children:[r==="ru"?"Кв.":"Kv."," ",i.apartmentNumber]}),e.jsxs("span",{children:[i.voteWeight," ",r==="ru"?"кв.м":"kv.m"]}),i.phone&&e.jsxs("span",{className:"flex items-center gap-1",children:[e.jsx(xe,{className:"w-3 h-3"}),i.phone]})]}),i.comment&&e.jsxs("div",{className:"mt-2 p-2 bg-white rounded-lg text-sm text-gray-600",children:[e.jsx(he,{className:"w-3 h-3 inline mr-1"}),i.comment]}),i.requestCount>0&&e.jsx("div",{className:"mt-2 text-xs text-orange-600",children:r==="ru"?`Отправлено запросов: ${i.requestCount}/2`:`Yuborilgan so'rovlar: ${i.requestCount}/2`})]}),e.jsxs("button",{onClick:()=>_({voterId:i.voterId,voterName:i.voterName}),disabled:!i.canSendRequest||p===i.voterId,className:`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${i.canSendRequest?"bg-primary-500 text-white hover:bg-primary-600":"bg-gray-200 text-gray-400 cursor-not-allowed"}`,children:[e.jsx(V,{className:"w-4 h-4"}),r==="ru"?"Запросить":"So'rash"]})]})},i.voteId))})]}),(b==="agenda"||t.status!=="voting_open")&&e.jsxs("div",{children:[e.jsx("h3",{className:"font-medium mb-3",children:r==="ru"?"Повестка дня":"Kun tartibi"}),e.jsx("div",{className:"space-y-4",children:t.agendaItems.map((i,C)=>{const n=m(t.id,i.id);return e.jsx("div",{className:"p-4 rounded-xl bg-gray-50 border border-gray-200",children:e.jsxs("div",{className:"flex items-start justify-between gap-4",children:[e.jsxs("div",{className:"flex-1",children:[e.jsxs("div",{className:"font-medium",children:[C+1,". ",i.title]}),e.jsx("p",{className:"text-sm text-gray-500 mt-1",children:i.description}),i.attachments&&i.attachments.length>0&&e.jsx("div",{className:"flex flex-wrap gap-2 mt-2",children:i.attachments.map((I,we)=>e.jsx("div",{children:I.type.startsWith("image/")?e.jsx("a",{href:I.url,target:"_blank",rel:"noopener noreferrer",children:e.jsx("img",{src:I.url,alt:I.name,className:"w-16 h-16 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity"})}):e.jsxs("a",{href:I.url,target:"_blank",rel:"noopener noreferrer",className:"flex items-center gap-1 px-2 py-1 bg-white rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors",children:[e.jsx(M,{className:"w-4 h-4 text-gray-400 flex-shrink-0"}),e.jsx("span",{className:"max-w-[120px] truncate",children:I.name})]})},we))}),["voting_open","voting_closed","results_published","protocol_generated","protocol_approved"].includes(t.status)&&e.jsxs("div",{className:"mt-3 pt-3 border-t border-gray-200",children:[e.jsxs("div",{className:"grid grid-cols-3 gap-2 text-sm",children:[e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx(ye,{className:"w-4 h-4 text-green-500"}),e.jsxs("span",{children:[n.votesFor," (",n.percentFor.toFixed(0),"%)"]})]}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx(Q,{className:"w-4 h-4 text-red-500"}),e.jsx("span",{children:n.votesAgainst})]}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx(je,{className:"w-4 h-4 text-gray-400"}),e.jsx("span",{children:n.votesAbstain})]})]}),e.jsx("div",{className:"mt-2 h-2 bg-gray-200 rounded-full overflow-hidden",children:e.jsx("div",{className:`h-full ${n.thresholdMet?"bg-green-500":"bg-red-500"}`,style:{width:`${n.percentFor}%`}})}),e.jsxs("div",{className:"flex items-center justify-between mt-1 text-xs text-gray-500",children:[e.jsx("span",{children:"0%"}),e.jsxs("span",{children:[r==="ru"?"Порог:":"Chegara:"," ",q[i.threshold].percent,"%"]}),e.jsx("span",{children:"100%"})]})]})]}),i.isApproved!==void 0&&e.jsx("span",{className:`px-2 py-1 rounded-lg text-xs font-medium ${i.isApproved?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`,children:i.isApproved?r==="ru"?"Принято":"Qabul":r==="ru"?"Не принято":"Rad"})]})},i.id)})})]})]}),j&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4",children:e.jsxs("div",{className:"bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6",children:[e.jsx("h3",{className:"text-base sm:text-lg font-bold mb-4",children:r==="ru"?"Запрос на пересмотр голоса":"Ovozni qayta ko'rib chiqish so'rovi"}),e.jsxs("div",{className:"mb-4 p-3 bg-gray-50 rounded-xl",children:[e.jsx("div",{className:"text-sm text-gray-500",children:r==="ru"?"Получатель:":"Qabul qiluvchi:"}),e.jsx("div",{className:"font-medium",children:j.voterName})]}),e.jsxs("div",{className:"mb-4",children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:r==="ru"?"Причина запроса:":"So'rov sababi:"}),e.jsxs("select",{value:f,onChange:i=>s(i.target.value),className:"w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent",children:[e.jsx("option",{value:"",children:r==="ru"?"Выберите причину...":"Sababni tanlang..."}),B.map(i=>e.jsx("option",{value:i.value,children:i.label},i.value))]})]}),e.jsxs("div",{className:"mb-4",children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:r==="ru"?"Сообщение (необязательно):":"Xabar (ixtiyoriy):"}),e.jsx("textarea",{value:w,onChange:i=>d(i.target.value),placeholder:r==="ru"?"Личное сообщение жителю...":"Aholiga shaxsiy xabar...",className:"w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none",rows:3,maxLength:500}),e.jsxs("div",{className:"text-xs text-gray-400 text-right mt-1",children:[w.length,"/500"]})]}),e.jsxs("div",{className:"p-3 bg-yellow-50 rounded-xl mb-4 text-sm text-yellow-800",children:[e.jsx(te,{className:"w-4 h-4 inline mr-1"}),r==="ru"?"Это только просьба. Житель сам решает, менять голос или нет.":"Bu faqat iltimos. Aholi ovozni o'zgartirish yoki o'zgartirmaslikni o'zi hal qiladi."]}),e.jsxs("div",{className:"flex gap-3",children:[e.jsx("button",{onClick:()=>{_(null),s(""),d("")},className:"flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors",children:r==="ru"?"Отмена":"Bekor qilish"}),e.jsxs("button",{onClick:O,disabled:!f||!!p,className:"flex-1 px-4 py-2 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2",children:[e.jsx(V,{className:"w-4 h-4"}),p?r==="ru"?"Отправка...":"Yuborilmoqda...":r==="ru"?"Отправить":"Yuborish"]})]})]})})]})})}export{er as MeetingsPage};
//# sourceMappingURL=MeetingsPage-1773332263024-Cyqaxt5t.js.map
