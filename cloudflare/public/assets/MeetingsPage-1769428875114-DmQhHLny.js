import{r as h,j as e,at as H,h as K,B as Z,ad as L,U as J,F as Q,a1 as we,a2 as ee,X as U,aa as le,aN as ie,ag as ne,aO as oe,g as ce,o as de,ac as re,O as te,aP as Y,l as pe,aQ as me,an as V,aR as xe,ax as he}from"./react-vendor-1769428875114-t_MJ7TI5.js";import{b as ue,d as be,h as ve,i as se,M as R,A as q,D as A}from"./index-1769428875114-CG_16j_e.js";import{P as ge,Q as ae}from"./vendor-1769428875114-wOrLRiCI.js";import"./zustand-1769428875114-wNUYBKDB.js";import"./qr-scanner-1769428875114-B_vB3SDT.js";const T={name:"OOO KAMIZO",address:"г. Ташкент, Яшнобадский район, ул. Махтумкули, дом 93/3",bank:"«Ориент Финанс» ЧАКБ Миробад филиал",account:"20208000805307918001",inn:"307928888",oked:"81100",mfo:"01071"};function Pe(t,s){const r=URL.createObjectURL(t),p=/iPad|iPhone|iPod/.test(navigator.userAgent),c=/^((?!chrome|android).)*safari/i.test(navigator.userAgent);if(p||c)window.open(r,"_blank")||(window.location.href=r),setTimeout(()=>URL.revokeObjectURL(r),1e4);else{const n=document.createElement("a");n.href=r,n.download=s,n.style.display="none",document.body.appendChild(n),n.click(),document.body.removeChild(n),setTimeout(()=>URL.revokeObjectURL(r),100)}}const fe={0:"января",1:"февраля",2:"марта",3:"апреля",4:"мая",5:"июня",6:"июля",7:"августа",8:"сентября",9:"октября",10:"ноября",11:"декабря"};function je(t){if(!t)return"___";const s=new Date(t);return`${s.getDate()} ${fe[s.getMonth()]} ${s.getFullYear()}`}function ye(t){if(!t)return"___";const s=new Date(t);return`${s.getHours().toString().padStart(2,"0")}:${s.getMinutes().toString().padStart(2,"0")}`}function E(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}function Ne(t,s){const r=t.votes_for_area+t.votes_against_area+t.votes_abstain_area;return{votesFor:t.votes_for_area,votesAgainst:t.votes_against_area,votesAbstain:t.votes_abstain_area,percentFor:r>0?t.votes_for_area/r*100:0,percentAgainst:r>0?t.votes_against_area/r*100:0,percentAbstain:r>0?t.votes_abstain_area/r*100:0}}function X(t){const s=t.split(",")[1],r=atob(s),p=new Uint8Array(r.length);for(let c=0;c<r.length;c++)p[c]=r.charCodeAt(c);return p}async function ze(){const t=[`Компания: ${T.name}`,`Адрес: ${T.address}`,`Банк: ${T.bank}`,`Р/С: ${T.account}`,`ИНН: ${T.inn}`,`ОКЭД: ${T.oked}`,`МФО: ${T.mfo}`].join(`
`);return await ae.toDataURL(t,{width:150,margin:1,color:{dark:"#1f2937",light:"#ffffff"}})}async function _e(t,s,r){const p=["ЭЛЕКТРОННАЯ ПОДПИСЬ",`Протокол: ${s}`,`ФИО: ${t.voter_name}`,`Квартира: ${t.apartment_number||"-"}`,`Площадь: ${t.vote_weight?.toFixed(2)||"-"} кв.м`,`Голос: ${t.choice==="for"?"ЗА":t.choice==="against"?"ПРОТИВ":"ВОЗДЕРЖАЛСЯ"}`,`Дата: ${new Date(t.voted_at).toLocaleString("ru-RU")}`,`Адрес: ${r}`].join(`
`);return await ae.toDataURL(p,{width:80,margin:1,color:{dark:"#1f2937",light:"#ffffff"}})}function G(t){return`
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
</w:tbl>`}function $e(t,s){let r=`
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
  </w:tr>`;return t.forEach((p,c)=>{const n=new Date(p.voted_at),f=p.choice==="for"?"ЗА":p.choice==="against"?"ПРОТИВ":"ВОЗДЕРЖ.",g=s.get(p.voter_id),u=g?`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="600000" cy="600000"/><wp:docPr id="${1e3+c}" name="QR Signature ${c}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="voter_qr_${c}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${g}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="600000" cy="600000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`:"<w:r><w:t>✓</w:t></w:r>";r+=`
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${c+1}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${E(p.voter_name)}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${p.apartment_number||"-"}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${p.vote_weight?.toFixed(2)||"-"}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${n.toLocaleDateString("ru-RU")}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${f}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/></w:pPr>${u}</w:p>
    </w:tc>
  </w:tr>`}),r+="</w:tbl>",r}function Ce(t,s){if(!s||s.length===0)return"";const r=s.some(c=>c.comment&&c.comment.trim().length>0);let p=`
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
  </w:tr>`;return s.forEach((c,n)=>{const f=c.choice==="for"?"ЗА":c.choice==="against"?"ПРОТИВ":"ВОЗДЕРЖАЛСЯ",g=c.comment?.trim()||"";p+=`
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${n+1}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="${r?"2500":"3500"}" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${E(c.voter_name)}</w:t></w:r></w:p>
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
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${f}</w:t></w:r></w:p>
    </w:tc>
    ${r?`<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:rPr><w:sz w:val="14"/><w:i/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="14"/><w:i/></w:rPr><w:t>${E(g)}</w:t></w:r></w:p>
    </w:tc>`:""}
  </w:tr>`}),p+="</w:tbl>",p}async function ke(t){const{meeting:s,agendaItems:r,voteRecords:p,votesByItem:c}=t,n=s.buildingAddress||s.building_address||"Адрес не указан",f=je(s.confirmed_date_time||s.voting_opened_at),g=ye(s.confirmed_date_time||s.voting_opened_at),u=s.location||n,I=s.format==="online"?"заочной":s.format==="hybrid"?"очно-заочной":"очной",b=await ze(),v=new Map,N=new Map;for(let d=0;d<p.length;d++){const x=p[d],y=await _e(x,s.number,n);v.set(x.voter_id,y),N.set(x.voter_id,`rId${200+d}`)}let w="";w+=`
<w:p><w:pPr><w:spacing w:before="200" w:after="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>1. Избрание Председателя и Секретаря собрания</w:t></w:r></w:p>
<w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>СЛУШАЛИ: Предложение об избрании Председателя и Секретаря собрания из числа присутствующих собственников помещений.</w:t></w:r></w:p>
<w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>ПРЕДЛОЖЕНО: Избрать Председателем собрания представителя УК, Секретарём - ${s.organizer_name||"представителя УК"}.</w:t></w:r></w:p>
<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>ГОЛОСОВАЛИ:</w:t></w:r></w:p>
${G({votesFor:s.voted_area,votesAgainst:0,votesAbstain:0,percentFor:100,percentAgainst:0,percentAbstain:0})}
<w:p><w:pPr><w:spacing w:before="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>РЕШЕНИЕ: Избрать Председателя и Секретаря собрания. Решение принято.</w:t></w:r></w:p>
`,r.forEach((d,x)=>{const y=Ne(d,s.total_area),z=x+2,C=y.percentFor>50,k=c[d.id]||[];w+=`
<w:p><w:pPr><w:spacing w:before="300" w:after="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>${z}. ${E(d.title)}</w:t></w:r></w:p>
${d.description?`<w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>СЛУШАЛИ: ${E(d.description)}</w:t></w:r></w:p>`:""}
<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>ГОЛОСОВАЛИ:</w:t></w:r></w:p>
${G(y)}
${Ce(d,k)}
<w:p><w:pPr><w:spacing w:before="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>РЕШЕНИЕ: ${C?"Решение принято.":"Решение не принято."}</w:t></w:r></w:p>
`});const S=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
    <w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>ПРОТОКОЛ № ${s.number}/${new Date().getFullYear()}</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>общего собрания собственников помещений</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>многоквартирного дома по адресу:</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>${E(n)}</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>проведённого в форме ${I} голосования</w:t></w:r></w:p>

    <!-- Meeting Info -->
    <w:p><w:pPr><w:spacing w:before="200"/><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Дата проведения: </w:t></w:r>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${f}</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Время: </w:t></w:r>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${g}</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Место проведения: </w:t></w:r>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${E(u)}</w:t></w:r></w:p>

    <!-- Quorum Info -->
    <w:p><w:pPr><w:spacing w:before="200"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>КВОРУМ:</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>Общая площадь помещений в доме: ${s.total_area.toFixed(2)} кв.м</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>Площадь помещений проголосовавших собственников: ${s.voted_area.toFixed(2)} кв.м</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>Процент участия: ${s.participation_percent.toFixed(1)}%</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>Количество проголосовавших: ${s.participated_count} из ${s.total_eligible_count} собственников</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="${s.quorum_reached?"008000":"FF0000"}"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="${s.quorum_reached?"008000":"FF0000"}"/></w:rPr><w:t>Кворум ${s.quorum_reached?"ИМЕЕТСЯ":"ОТСУТСТВУЕТ"} (требуется ${s.quorum_percent}%)</w:t></w:r></w:p>

    <!-- Agenda -->
    <w:p><w:pPr><w:spacing w:before="300" w:after="100"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>ПОВЕСТКА ДНЯ:</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>1. Избрание Председателя и Секретаря собрания</w:t></w:r></w:p>
    ${r.map((d,x)=>`
    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${x+2}. ${E(d.title)}</w:t></w:r></w:p>`).join("")}

    <!-- Agenda Items Content -->
    ${w}

    <!-- UK QR Code Signature -->
    <w:p><w:pPr><w:spacing w:before="400"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="900000" cy="900000"/><wp:docPr id="999" name="UK QR Code"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="uk_qr.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId100" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="900000" cy="900000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>Управляющая компания</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="18"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${T.name}</w:t></w:r></w:p>

    <!-- Appendix - Page Break -->
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>

    <!-- Appendix Header -->
    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>ПРИЛОЖЕНИЕ № 1</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>к Протоколу № ${s.number}/${new Date().getFullYear()}</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>РЕЕСТР УЧАСТНИКОВ ГОЛОСОВАНИЯ С ЭЛЕКТРОННЫМИ ПОДПИСЯМИ</w:t></w:r></w:p>

    <w:p><w:pPr><w:spacing w:before="200"/></w:pPr></w:p>

    ${$e(p,N)}

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
</w:document>`,m=new ge,_=X(b);m.file("word/media/uk_qr.png",_);for(const[d,x]of v){const y=X(x),z=p.findIndex(C=>C.voter_id===d);m.file(`word/media/voter_qr_${z}.png`,y)}let j=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId100" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/uk_qr.png"/>`;for(let d=0;d<p.length;d++)j+=`
  <Relationship Id="rId${200+d}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/voter_qr_${d}.png"/>`;j+=`
</Relationships>`,m.file("[Content_Types].xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`),m.file("_rels/.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`),m.file("word/_rels/document.xml.rels",j),m.file("word/document.xml",S);const a=m.generate({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}),o=`Протокол_${s.number}_${n.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g,"_")}.docx`;Pe(a,o)}function Fe(){const{user:t}=ue(),{t:s,language:r}=be(),{buildings:p,fetchBuildings:c}=ve(),{meetings:n,fetchMeetings:f,createMeeting:g,approveMeeting:u,rejectMeeting:I,confirmSchedule:b,openVoting:v,closeVoting:N,publishResults:w,generateProtocol:P,approveProtocol:S,deleteMeeting:m,calculateAgendaItemResult:_,calculateMeetingQuorum:j}=se();h.useEffect(()=>{f(),c()},[f,c]);const[a,o]=h.useState("all"),[d,x]=h.useState(!1),[y,z]=h.useState(null),[C,k]=h.useState(!1),F=h.useMemo(()=>{switch(a){case"active":return n.filter(l=>["schedule_poll_open","schedule_confirmed","voting_open"].includes(l.status));case"completed":return n.filter(l=>["voting_closed","results_published","protocol_generated","protocol_approved"].includes(l.status));case"pending":return n.filter(l=>["draft","pending_moderation"].includes(l.status));default:return n}},[n,a]),M=l=>R[l]?.color||"gray",O=l=>{const D=R[l];return r==="ru"?D?.label:D?.labelUz},W=l=>new Date(l).toLocaleDateString(r==="ru"?"ru-RU":"uz-UZ",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}),B=l=>{z(l),k(!0)},i=async l=>{confirm(r==="ru"?"Удалить собрание? Это действие необратимо.":"Yig'ilishni o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.")&&await m(l)},$=[{id:"all",label:r==="ru"?"Все":"Barchasi",count:n.length},{id:"active",label:r==="ru"?"Активные":"Faol",count:n.filter(l=>["schedule_poll_open","schedule_confirmed","voting_open"].includes(l.status)).length},{id:"pending",label:r==="ru"?"Ожидают":"Kutmoqda",count:n.filter(l=>["draft","pending_moderation"].includes(l.status)).length},{id:"completed",label:r==="ru"?"Завершены":"Tugallangan",count:n.filter(l=>["voting_closed","results_published","protocol_generated","protocol_approved"].includes(l.status)).length}];return e.jsxs("div",{className:"space-y-6",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"text-2xl font-bold text-gray-900",children:s("meetings.title")}),e.jsx("p",{className:"text-gray-500",children:s("meetings.subtitle")})]}),e.jsxs("button",{onClick:()=>x(!0),className:"btn-primary flex items-center gap-2",children:[e.jsx(H,{className:"w-5 h-5"}),s("meetings.create")]})]}),e.jsx("div",{className:"flex gap-2 flex-wrap",children:$.map(l=>e.jsxs("button",{onClick:()=>o(l.id),className:`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${a===l.id?"bg-orange-400 text-gray-900":"bg-white text-gray-600 hover:bg-gray-100"}`,children:[l.label,l.count>0&&e.jsx("span",{className:"ml-1 px-2 py-0.5 rounded-full bg-gray-900/10 text-xs",children:l.count})]},l.id))}),e.jsx("div",{className:"space-y-4",children:F.length===0?e.jsxs("div",{className:"glass-card p-12 text-center",children:[e.jsx(K,{className:"w-16 h-16 mx-auto text-gray-300 mb-4"}),e.jsx("h3",{className:"text-lg font-medium text-gray-600 mb-2",children:s("meetings.noMeetings")}),e.jsx("p",{className:"text-gray-400",children:s("meetings.createFirst")})]}):F.map(l=>e.jsx(Ie,{meeting:l,language:r,getStatusColor:M,getStatusLabel:O,formatDate:W,onViewDetails:()=>B(l),onApprove:()=>u(l.id),onReject:D=>I(l.id,D),onConfirmSchedule:()=>b(l.id),onOpenVoting:()=>v(l.id),onCloseVoting:()=>N(l.id),onPublishResults:()=>w(l.id),onGenerateProtocol:()=>P(l.id),onApproveProtocol:()=>S(l.id),onDelete:()=>i(l.id),calculateQuorum:()=>j(l.id),user:t},l.id))}),d&&e.jsx(Se,{onClose:()=>x(!1),onCreate:async l=>{try{await g(l),await f(),x(!1)}catch{}},language:r,user:t,buildings:p.map(l=>({id:l.id,name:l.name,address:l.address}))}),C&&y&&e.jsx(qe,{meeting:y,onClose:()=>{k(!1),z(null)},language:r,calculateResult:_,calculateQuorum:()=>j(y.id)})]})}function Ie({meeting:t,language:s,getStatusColor:r,getStatusLabel:p,formatDate:c,onViewDetails:n,onApprove:f,onReject:g,onConfirmSchedule:u,onOpenVoting:I,onCloseVoting:b,onPublishResults:v,onGenerateProtocol:N,onApproveProtocol:w,onDelete:P,calculateQuorum:S,user:m}){const _=S(),j=r(t.status),a={gray:"bg-gray-100 text-gray-700",yellow:"bg-yellow-100 text-orange-700",blue:"bg-blue-100 text-blue-700",indigo:"bg-indigo-100 text-indigo-700",green:"bg-green-100 text-green-700",orange:"bg-orange-100 text-orange-700",purple:"bg-purple-100 text-purple-700",teal:"bg-teal-100 text-teal-700",emerald:"bg-emerald-100 text-emerald-700",red:"bg-red-100 text-red-700"};return e.jsxs("div",{className:"glass-card p-5 hover:shadow-lg transition-shadow",children:[e.jsxs("div",{className:"flex items-start justify-between gap-4",children:[e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsxs("div",{className:"flex items-center gap-3 mb-3 flex-wrap",children:[e.jsx("span",{className:`px-3 py-1 rounded-lg text-sm font-medium ${a[j]||a.gray}`,children:p(t.status)}),e.jsxs("span",{className:"text-sm text-gray-500",children:["#",t.number]}),e.jsx("span",{className:`px-2 py-0.5 rounded text-xs font-medium ${t.format==="online"?"bg-blue-50 text-blue-600":t.format==="offline"?"bg-green-50 text-green-600":"bg-purple-50 text-purple-600"}`,children:t.format==="online"?s==="ru"?"Онлайн":"Onlayn":t.format==="offline"?s==="ru"?"Очное":"Yuzma-yuz":s==="ru"?"Смешанное":"Aralash"})]}),e.jsxs("div",{className:"flex items-center gap-4 text-sm text-gray-600 mb-2",children:[e.jsxs("span",{className:"flex items-center gap-1",children:[e.jsx(Z,{className:"w-4 h-4"}),t.buildingAddress]}),t.confirmedDateTime&&e.jsxs("span",{className:"flex items-center gap-1",children:[e.jsx(L,{className:"w-4 h-4"}),c(t.confirmedDateTime)]})]}),e.jsxs("div",{className:"flex items-center gap-2 text-sm text-gray-500 mb-3",children:[e.jsx(J,{className:"w-4 h-4"}),e.jsx("span",{children:t.organizerName}),e.jsxs("span",{className:"text-gray-400",children:["(",t.organizerType==="resident"?s==="ru"?"Житель":"Aholi":s==="ru"?"УК":"UK",")"]})]}),e.jsxs("div",{className:"flex items-center gap-2 text-sm",children:[e.jsx(Q,{className:"w-4 h-4 text-gray-400"}),e.jsxs("span",{className:"text-gray-600",children:[t.agendaItems.length," ",s==="ru"?"вопросов в повестке":"savol kun tartibida"]})]}),t.status==="schedule_poll_open"&&t.scheduleOptions&&t.scheduleOptions.length>0&&e.jsxs("div",{className:"mt-3 pt-3 border-t border-gray-100",children:[e.jsxs("div",{className:"text-sm font-medium text-gray-700 mb-2 flex items-center gap-2",children:[e.jsx(L,{className:"w-4 h-4 text-blue-500"}),s==="ru"?"Голосование за дату:":"Sana uchun ovoz berish:"]}),e.jsx("div",{className:"space-y-1",children:t.scheduleOptions.map(o=>{const d=t.scheduleOptions.reduce((C,k)=>C+(k.voteCount??k.votes?.length??0),0),x=o.voteCount??o.votes?.length??0,y=d>0?x/d*100:0,z=x>0&&x===Math.max(...t.scheduleOptions.map(C=>C.voteCount??C.votes?.length??0));return e.jsxs("div",{className:"flex items-center gap-2 text-sm",children:[e.jsxs("div",{className:`flex-1 flex items-center gap-2 ${z?"font-medium text-blue-700":"text-gray-600"}`,children:[e.jsx("span",{children:c(o.dateTime)}),z&&x>0&&e.jsx("span",{className:"text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded",children:s==="ru"?"Лидер":"Yetakchi"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("div",{className:"w-20 h-2 bg-gray-100 rounded-full overflow-hidden",children:e.jsx("div",{className:"h-full bg-blue-500 rounded-full transition-all",style:{width:`${y}%`}})}),e.jsxs("span",{className:"text-xs text-gray-500 w-12 text-right",children:[x," (",y.toFixed(0),"%)"]})]})]},o.id)})}),e.jsxs("div",{className:"text-xs text-gray-400 mt-2",children:[s==="ru"?"Всего голосов: ":"Jami ovozlar: ",t.scheduleOptions.reduce((o,d)=>o+(d.voteCount??d.votes?.length??0),0)]})]}),["voting_open","voting_closed","results_published","protocol_generated","protocol_approved"].includes(t.status)&&e.jsxs("div",{className:"flex items-center gap-4 mt-3 pt-3 border-t border-gray-100",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(K,{className:"w-4 h-4 text-gray-400"}),e.jsxs("span",{className:"text-sm",children:[_.participated,"/",_.total," (",_.percent.toFixed(1),"%)"]})]}),e.jsx("span",{className:`text-xs px-2 py-0.5 rounded-full font-medium ${_.quorumReached?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`,children:_.quorumReached?s==="ru"?"Кворум есть":"Kvorum bor":s==="ru"?"Нет кворума":"Kvorum yo'q"})]})]}),e.jsxs("div",{className:"flex flex-col gap-2",children:[e.jsx("button",{onClick:n,className:"p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors",title:s==="ru"?"Подробнее":"Batafsil",children:e.jsx(we,{className:"w-5 h-5"})}),t.status==="pending_moderation"&&(m?.role==="admin"||m?.role==="manager"||m?.role==="director")&&e.jsxs(e.Fragment,{children:[e.jsx("button",{onClick:f,className:"p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors",title:s==="ru"?"Одобрить":"Tasdiqlash",children:e.jsx(ee,{className:"w-5 h-5"})}),e.jsx("button",{onClick:()=>g(s==="ru"?"Отклонено модератором":"Moderator tomonidan rad etildi"),className:"p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors",title:s==="ru"?"Отклонить":"Rad etish",children:e.jsx(U,{className:"w-5 h-5"})})]}),(m?.role==="admin"||m?.role==="manager"||m?.role==="director")&&e.jsx("button",{onClick:P,className:"p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors",title:s==="ru"?"Удалить":"O'chirish",children:e.jsx(le,{className:"w-5 h-5"})})]})]}),(m?.role==="admin"||m?.role==="manager"||m?.role==="director")&&e.jsxs("div",{className:"mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2",children:[t.status==="schedule_poll_open"&&e.jsxs("button",{onClick:u,className:"flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium",children:[e.jsx(ie,{className:"w-4 h-4"}),s==="ru"?"Подтвердить дату":"Sanani tasdiqlash"]}),t.status==="schedule_confirmed"&&e.jsxs("button",{onClick:I,className:"flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm font-medium",children:[e.jsx(ne,{className:"w-4 h-4"}),s==="ru"?"Открыть голосование":"Ovoz berishni ochish"]}),t.status==="voting_open"&&e.jsxs("button",{onClick:b,className:"flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors text-sm font-medium",children:[e.jsx(oe,{className:"w-4 h-4"}),s==="ru"?"Закрыть голосование":"Ovoz berishni yopish"]}),t.status==="voting_closed"&&e.jsxs("button",{onClick:v,className:"flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors text-sm font-medium",children:[e.jsx(ce,{className:"w-4 h-4"}),s==="ru"?"Опубликовать итоги":"Natijalarni e'lon qilish"]}),t.status==="results_published"&&e.jsxs("button",{onClick:N,className:"flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-colors text-sm font-medium",children:[e.jsx(Q,{className:"w-4 h-4"}),s==="ru"?"Сформировать протокол":"Bayonnoma yaratish"]}),t.status==="protocol_generated"&&e.jsxs("button",{onClick:w,className:"flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors text-sm font-medium",children:[e.jsx(de,{className:"w-4 h-4"}),s==="ru"?"Подписать протокол":"Bayonnomani imzolash"]}),t.status==="protocol_approved"&&e.jsxs("button",{onClick:n,className:"flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium",children:[e.jsx(re,{className:"w-4 h-4"}),s==="ru"?"Скачать протокол":"Bayonnomani yuklab olish"]})]})]})}function Se({onClose:t,onCreate:s,language:r,user:p,buildings:c}){const[n,f]=h.useState(1),[g,u]=h.useState(!1),[I,b]=h.useState(!1),[v,N]=h.useState({title:"",description:"",threshold:"simple_majority"}),[w,P]=h.useState({buildingId:p?.buildingId||(c.length>0?c[0].id:""),buildingAddress:c.length>0?c[0].address:"",organizerType:"management",format:"online",agendaItems:[],customItems:[],location:"",description:"",meetingTime:"19:00"}),S=a=>{const o=c.find(d=>d.id===a);P({...w,buildingId:a,buildingAddress:o?.address||""})},m=a=>{w.agendaItems.includes(a)?P({...w,agendaItems:w.agendaItems.filter(o=>o!==a)}):P({...w,agendaItems:[...w.agendaItems,a]})},_=async()=>{if(!p||!w.buildingId||g)return;u(!0);const a=[...w.agendaItems.map(o=>({type:o,title:r==="ru"?q[o].label:q[o].labelUz,description:r==="ru"?q[o].description:q[o].descriptionUz,threshold:q[o].defaultThreshold,materials:[]})),...w.customItems.map(o=>({type:"other",title:o.title,description:o.description,threshold:o.threshold,materials:[]}))];try{await s({buildingId:w.buildingId,buildingAddress:w.buildingAddress,organizerType:w.organizerType,organizerId:p.id,organizerName:p.name,format:w.format,agendaItems:a,location:w.location||void 0,description:w.description||void 0,meetingTime:w.meetingTime||"19:00"})}finally{u(!1)}},j=[{num:1,label:r==="ru"?"Тип":"Turi"},{num:2,label:r==="ru"?"Повестка":"Kun tartibi"},{num:3,label:r==="ru"?"Публикация":"Nashr"}];return e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4",children:e.jsxs("div",{className:"bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto",children:[e.jsxs("div",{className:"p-6 border-b border-gray-100 flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("h2",{className:"text-xl font-bold",children:r==="ru"?"Созвать собрание":"Yig'ilish chaqirish"}),e.jsx("p",{className:"text-sm text-gray-500",children:r==="ru"?`Шаг ${n} из 3`:`Bosqich ${n} dan 3`})]}),e.jsx("button",{onClick:t,className:"p-2 hover:bg-gray-100 rounded-xl transition-colors",children:e.jsx(U,{className:"w-5 h-5"})})]}),e.jsx("div",{className:"px-6 py-4 border-b border-gray-100",children:e.jsx("div",{className:"flex items-center justify-between",children:j.map((a,o)=>e.jsxs("div",{className:"flex items-center",children:[e.jsx("div",{className:`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${n>=a.num?"bg-orange-400 text-gray-900":"bg-gray-200 text-gray-500"}`,children:a.num}),e.jsx("span",{className:`ml-2 text-sm ${n>=a.num?"text-gray-900":"text-gray-500"}`,children:a.label}),o<j.length-1&&e.jsx("div",{className:`w-16 h-1 mx-4 rounded ${n>a.num?"bg-orange-400":"bg-gray-200"}`})]},a.num))})}),e.jsxs("div",{className:"p-6 space-y-6",children:[n===1&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-3",children:r==="ru"?"Выберите дом":"Uyni tanlang"}),c.length===0?e.jsx("div",{className:"p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800",children:r==="ru"?"Нет доступных домов. Сначала добавьте дом в системе.":"Mavjud uylar yo'q. Avval tizimda uy qo'shing."}):e.jsx("select",{value:w.buildingId,onChange:a=>S(a.target.value),className:"w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-400 focus:border-orange-400",children:c.map(a=>e.jsxs("option",{value:a.id,children:[a.name," - ",a.address]},a.id))})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-3",children:r==="ru"?"Организатор":"Tashkilotchi"}),e.jsxs("div",{className:"grid grid-cols-2 gap-3",children:[e.jsxs("button",{onClick:()=>P({...w,organizerType:"management"}),className:`p-4 rounded-xl border-2 transition-colors ${w.organizerType==="management"?"border-orange-400 bg-yellow-50":"border-gray-200 hover:border-gray-300"}`,children:[e.jsx(Z,{className:"w-6 h-6 mb-2 mx-auto text-gray-600"}),e.jsx("div",{className:"text-sm font-medium",children:r==="ru"?"Управляющая компания":"Boshqaruv kompaniyasi"})]}),e.jsxs("button",{onClick:()=>P({...w,organizerType:"resident"}),className:`p-4 rounded-xl border-2 transition-colors ${w.organizerType==="resident"?"border-orange-400 bg-yellow-50":"border-gray-200 hover:border-gray-300"}`,children:[e.jsx(J,{className:"w-6 h-6 mb-2 mx-auto text-gray-600"}),e.jsx("div",{className:"text-sm font-medium",children:r==="ru"?"Житель (инициатива)":"Aholi (tashabbusi)"})]})]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-3",children:r==="ru"?"Формат проведения":"O'tkazish formati"}),e.jsx("div",{className:"grid grid-cols-3 gap-3",children:["online","offline","hybrid"].map(a=>e.jsx("button",{onClick:()=>P({...w,format:a}),className:`p-3 rounded-xl border-2 transition-colors ${w.format===a?"border-orange-400 bg-yellow-50":"border-gray-200 hover:border-gray-300"}`,children:e.jsx("div",{className:"text-sm font-medium",children:a==="online"?r==="ru"?"Онлайн":"Onlayn":a==="offline"?r==="ru"?"Очное":"Yuzma-yuz":r==="ru"?"Смешанное":"Aralash"})},a))})]}),w.format!=="online"&&e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:r==="ru"?"Место проведения":"O'tkazish joyi"}),e.jsx("input",{type:"text",value:w.location,onChange:a=>P({...w,location:a.target.value}),className:"glass-input",placeholder:r==="ru"?"Например: Холл 1 этажа":"Masalan: 1-qavat zali"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:r==="ru"?"Время проведения":"O'tkazish vaqti"}),e.jsx("input",{type:"time",value:w.meetingTime,onChange:a=>P({...w,meetingTime:a.target.value}),className:"glass-input"}),e.jsx("p",{className:"text-xs text-gray-500 mt-1",children:r==="ru"?"Время для всех вариантов дат в голосовании":"Ovoz berishdagi barcha sanalar uchun vaqt"})]}),e.jsxs("div",{children:[e.jsxs("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:[r==="ru"?"Обоснование собрания":"Yig'ilish asoslashi",e.jsxs("span",{className:"text-gray-400 font-normal ml-1",children:["(",r==="ru"?"необязательно":"ixtiyoriy",")"]})]}),e.jsx("textarea",{value:w.description,onChange:a=>P({...w,description:a.target.value}),className:"glass-input min-h-[80px] resize-none",placeholder:r==="ru"?"Опишите причину созыва собрания и что планируется обсудить...":"Yig'ilish sababi va nimalar muhokama qilinishini tasvirlang...",rows:3})]})]}),n===2&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-3",children:r==="ru"?"Выберите вопросы повестки":"Kun tartibi savollarini tanlang"}),e.jsx("div",{className:"space-y-2 max-h-96 overflow-y-auto",children:Object.keys(q).map(a=>{const o=q[a],d=w.agendaItems.includes(a);return e.jsx("button",{onClick:()=>m(a),className:`w-full p-4 rounded-xl border-2 text-left transition-colors ${d?"border-orange-400 bg-yellow-50":"border-gray-200 hover:border-gray-300"}`,children:e.jsxs("div",{className:"flex items-start justify-between",children:[e.jsxs("div",{children:[e.jsx("div",{className:"font-medium",children:r==="ru"?o.label:o.labelUz}),e.jsx("div",{className:"text-sm text-gray-500 mt-1",children:r==="ru"?o.description:o.descriptionUz}),e.jsxs("div",{className:"flex items-center gap-2 mt-2",children:[e.jsx("span",{className:"text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600",children:r==="ru"?A[o.defaultThreshold].label:A[o.defaultThreshold].labelUz}),o.requiresMaterials&&e.jsx("span",{className:"text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-600",children:r==="ru"?"Нужны материалы":"Materiallar kerak"})]})]}),e.jsx("div",{className:`w-6 h-6 rounded-full border-2 flex items-center justify-center ${d?"border-orange-400 bg-orange-400":"border-gray-300"}`,children:d&&e.jsx(ee,{className:"w-4 h-4 text-gray-900"})})]})},a)})})]}),e.jsxs("div",{className:"mt-6 pt-6 border-t border-gray-200",children:[e.jsxs("div",{className:"flex items-center justify-between mb-3",children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700",children:r==="ru"?"Свои вопросы":"O'z savollaringiz"}),e.jsxs("button",{type:"button",onClick:()=>b(!0),className:"text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1",children:[e.jsx(H,{className:"w-4 h-4"}),r==="ru"?"Добавить вопрос":"Savol qo'shish"]})]}),w.customItems.length>0&&e.jsx("div",{className:"space-y-2 mb-4",children:w.customItems.map((a,o)=>e.jsx("div",{className:"p-3 rounded-xl border-2 border-orange-400 bg-yellow-50",children:e.jsxs("div",{className:"flex items-start justify-between",children:[e.jsxs("div",{className:"flex-1",children:[e.jsx("div",{className:"font-medium",children:a.title}),a.description&&e.jsx("div",{className:"text-sm text-gray-500 mt-1",children:a.description}),e.jsx("span",{className:"text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 mt-2 inline-block",children:r==="ru"?A[a.threshold].label:A[a.threshold].labelUz})]}),e.jsx("button",{onClick:()=>P({...w,customItems:w.customItems.filter((d,x)=>x!==o)}),className:"p-1 text-red-500 hover:bg-red-50 rounded",children:e.jsx(U,{className:"w-4 h-4"})})]})},o))}),I&&e.jsxs("div",{className:"p-4 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 space-y-3",children:[e.jsx("input",{type:"text",value:v.title,onChange:a=>N({...v,title:a.target.value}),className:"glass-input",placeholder:r==="ru"?"Название вопроса *":"Savol nomi *"}),e.jsx("textarea",{value:v.description,onChange:a=>N({...v,description:a.target.value}),className:"glass-input min-h-[60px] resize-none",placeholder:r==="ru"?"Описание (необязательно)":"Tavsif (ixtiyoriy)",rows:2}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-xs text-gray-500 mb-1",children:r==="ru"?"Порог принятия":"Qabul qilish chegarasi"}),e.jsx("select",{value:v.threshold,onChange:a=>N({...v,threshold:a.target.value}),className:"glass-input text-sm",children:Object.keys(A).map(a=>e.jsx("option",{value:a,children:r==="ru"?A[a].label:A[a].labelUz},a))})]}),e.jsxs("div",{className:"flex gap-2",children:[e.jsx("button",{type:"button",onClick:()=>{v.title.trim()&&(P({...w,customItems:[...w.customItems,{...v}]}),N({title:"",description:"",threshold:"simple_majority"}),b(!1))},disabled:!v.title.trim(),className:"flex-1 py-2 px-4 bg-orange-400 hover:bg-orange-500 text-gray-900 rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed",children:r==="ru"?"Добавить":"Qo'shish"}),e.jsx("button",{type:"button",onClick:()=>{b(!1),N({title:"",description:"",threshold:"simple_majority"})},className:"py-2 px-4 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium text-sm",children:r==="ru"?"Отмена":"Bekor qilish"})]})]})]}),w.agendaItems.length===0&&w.customItems.length===0&&e.jsx("p",{className:"text-sm text-red-500",children:r==="ru"?"Выберите хотя бы один вопрос или добавьте свой":"Kamida bitta savol tanlang yoki o'zingiznikini qo'shing"})]}),n===3&&e.jsx(e.Fragment,{children:e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"p-4 rounded-xl bg-gray-50",children:[e.jsx("h3",{className:"font-medium mb-3",children:r==="ru"?"Сводка":"Xulosa"}),e.jsxs("div",{className:"space-y-2 text-sm",children:[e.jsxs("div",{className:"flex justify-between",children:[e.jsx("span",{className:"text-gray-500",children:r==="ru"?"Формат:":"Format:"}),e.jsx("span",{className:"font-medium",children:w.format==="online"?r==="ru"?"Онлайн":"Onlayn":w.format==="offline"?r==="ru"?"Очное":"Yuzma-yuz":r==="ru"?"Смешанное":"Aralash"})]}),e.jsxs("div",{className:"flex justify-between",children:[e.jsx("span",{className:"text-gray-500",children:r==="ru"?"Дом:":"Uy:"}),e.jsx("span",{className:"font-medium",children:c.find(a=>a.id===w.buildingId)?.name||w.buildingAddress})]}),e.jsxs("div",{className:"flex justify-between",children:[e.jsx("span",{className:"text-gray-500",children:r==="ru"?"Организатор:":"Tashkilotchi:"}),e.jsx("span",{className:"font-medium",children:w.organizerType==="management"?r==="ru"?"УК":"UK":r==="ru"?"Житель":"Aholi"})]}),e.jsxs("div",{className:"flex justify-between",children:[e.jsx("span",{className:"text-gray-500",children:r==="ru"?"Вопросов:":"Savollar:"}),e.jsx("span",{className:"font-medium",children:w.agendaItems.length})]})]})]}),e.jsx("div",{className:"p-4 rounded-xl bg-blue-50 border border-blue-200",children:e.jsxs("div",{className:"flex items-start gap-3",children:[e.jsx(te,{className:"w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5"}),e.jsx("div",{className:"text-sm text-blue-700",children:r==="ru"?"После публикации жильцам будет отправлено уведомление. Они смогут проголосовать за удобную дату проведения собрания.":"Nashrdan so'ng aholiga bildirishnoma yuboriladi. Ular yig'ilish uchun qulay sanani tanlashlari mumkin bo'ladi."})]})}),e.jsxs("div",{className:"p-4 rounded-xl bg-yellow-50 border border-yellow-200",children:[e.jsx("h4",{className:"font-medium mb-2",children:r==="ru"?"Повестка дня:":"Kun tartibi:"}),e.jsxs("ol",{className:"list-decimal list-inside space-y-1 text-sm",children:[w.agendaItems.map(a=>e.jsx("li",{children:r==="ru"?q[a].label:q[a].labelUz},a)),w.customItems.map((a,o)=>e.jsxs("li",{className:"text-blue-700",children:[a.title,e.jsxs("span",{className:"text-xs text-gray-500 ml-1",children:["(",r==="ru"?"свой вопрос":"o'z savoli",")"]})]},`custom-${o}`))]})]}),w.description&&e.jsxs("div",{className:"p-4 rounded-xl bg-gray-50 border border-gray-200",children:[e.jsx("h4",{className:"font-medium mb-2",children:r==="ru"?"Обоснование:":"Asoslash:"}),e.jsx("p",{className:"text-sm text-gray-600",children:w.description})]})]})})]}),e.jsxs("div",{className:"p-6 border-t border-gray-100 flex gap-3",children:[n>1&&e.jsx("button",{onClick:()=>f(n-1),disabled:g,className:"flex-1 py-3 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50",children:r==="ru"?"Назад":"Orqaga"}),n<3?e.jsx("button",{onClick:()=>f(n+1),disabled:n===1&&!w.buildingId||n===2&&w.agendaItems.length===0&&w.customItems.length===0,className:"flex-1 py-3 rounded-xl font-medium bg-orange-400 text-gray-900 hover:bg-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",children:r==="ru"?"Далее":"Keyingi"}):e.jsx("button",{onClick:_,disabled:g||!w.buildingId,className:"flex-1 py-3 rounded-xl font-medium bg-orange-400 text-gray-900 hover:bg-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",children:g?r==="ru"?"Создание...":"Yaratilmoqda...":r==="ru"?"Опубликовать":"Nashr qilish"})]})]})})}function qe({meeting:t,onClose:s,language:r,calculateResult:p,calculateQuorum:c}){const n=c(),[f,g]=h.useState(!1),[u,I]=h.useState("agenda"),[b,v]=h.useState(null),[N,w]=h.useState([]),[P,S]=h.useState(!1),[m,_]=h.useState(null),[j,a]=h.useState(null),[o,d]=h.useState(""),[x,y]=h.useState(""),[z,C]=h.useState(null),{fetchAgainstVotes:k,sendReconsiderationRequest:F,fetchReconsiderationStats:M}=se();h.useEffect(()=>{u==="against"&&b&&(S(!0),k(t.id,b).then(i=>{w(i),S(!1)}))},[u,b,t.id,k]),h.useEffect(()=>{u==="against"&&M(t.id).then(i=>{C(i)})},[u,t.id,M]),h.useEffect(()=>{u==="against"&&!b&&t.agendaItems.length>0&&v(t.agendaItems[0].id)},[u,b,t.agendaItems]);const O=async()=>{if(!j||!b||!o)return;_(j.voterId);const i=await F(t.id,{agendaItemId:b,residentId:j.voterId,reason:o,messageToResident:x||void 0});if(i.success){const $=await k(t.id,b);w($),a(null),d(""),y("")}else alert(i.error||(r==="ru"?"Ошибка при отправке запроса":"So'rovni yuborishda xatolik"));_(null)},W=[{value:"discussed_personally",label:r==="ru"?"Обсудили лично":"Shaxsan muhokama qildik"},{value:"new_information",label:r==="ru"?"Появилась новая информация":"Yangi ma'lumot paydo bo'ldi"},{value:"clarification_needed",label:r==="ru"?"Требуется уточнение":"Aniqlik kiritish kerak"},{value:"other",label:r==="ru"?"Другое":"Boshqa"}],B=async()=>{g(!0);try{const i=await fetch(`/api/meetings/${t.id}/protocol/data`);if(!i.ok)throw new Error("Failed to fetch protocol data");const $=await i.json();await ke({meeting:{...$.meeting,buildingAddress:t.buildingAddress||$.meeting.building_address},agendaItems:$.agendaItems,voteRecords:$.voteRecords,votesByItem:$.votesByItem,protocolHash:$.protocolHash})}catch{alert(r==="ru"?"Ошибка при скачивании протокола":"Bayonnomani yuklashda xato")}finally{g(!1)}};return e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4",children:e.jsxs("div",{className:"bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto",children:[e.jsxs("div",{className:"p-6 border-b border-gray-100 flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("h2",{className:"text-xl font-bold",children:r==="ru"?`Собрание #${t.number}`:`Yig'ilish #${t.number}`}),e.jsx("p",{className:"text-sm text-gray-500",children:t.buildingAddress})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[["protocol_generated","protocol_approved"].includes(t.status)&&e.jsxs("button",{onClick:B,disabled:f,className:"flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition-colors disabled:opacity-50",children:[e.jsx(re,{className:"w-4 h-4"}),f?r==="ru"?"Загрузка...":"Yuklanmoqda...":r==="ru"?"Скачать протокол":"Bayonnomani yuklab olish"]}),e.jsx("button",{onClick:s,className:"p-2 hover:bg-gray-100 rounded-xl transition-colors",children:e.jsx(U,{className:"w-5 h-5"})})]})]}),e.jsxs("div",{className:"p-6 space-y-6",children:[e.jsxs("div",{className:"flex items-center gap-4 flex-wrap",children:[e.jsx("span",{className:`px-3 py-1 rounded-lg text-sm font-medium ${R[t.status]?.color==="green"?"bg-green-100 text-green-700":R[t.status]?.color==="blue"?"bg-blue-100 text-blue-700":R[t.status]?.color==="yellow"?"bg-yellow-100 text-orange-700":"bg-gray-100 text-gray-700"}`,children:r==="ru"?R[t.status]?.label:R[t.status]?.labelUz}),t.status!=="draft"&&t.status!=="pending_moderation"&&e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(K,{className:"w-4 h-4 text-gray-400"}),e.jsxs("span",{className:"text-sm",children:[n.participated,"/",n.total," (",n.percent.toFixed(1),"%)"]}),e.jsx("span",{className:`text-xs px-2 py-0.5 rounded-full font-medium ${n.quorumReached?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`,children:n.quorumReached?r==="ru"?"Кворум":"Kvorum":r==="ru"?"Нет кворума":"Kvorum yo'q"})]})]}),t.confirmedDateTime&&e.jsxs("div",{className:"flex items-center gap-2 text-gray-600",children:[e.jsx(L,{className:"w-5 h-5"}),e.jsx("span",{children:new Date(t.confirmedDateTime).toLocaleDateString(r==="ru"?"ru-RU":"uz-UZ",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})})]}),t.status==="voting_open"&&e.jsxs("div",{className:"flex gap-2 border-b border-gray-200",children:[e.jsx("button",{onClick:()=>I("agenda"),className:`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${u==="agenda"?"border-orange-500 text-orange-600":"border-transparent text-gray-500 hover:text-gray-700"}`,children:r==="ru"?"Повестка дня":"Kun tartibi"}),e.jsxs("button",{onClick:()=>I("against"),className:`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${u==="against"?"border-orange-500 text-orange-600":"border-transparent text-gray-500 hover:text-gray-700"}`,children:[e.jsx(Y,{className:"w-4 h-4"}),r==="ru"?"Голоса против":"Qarshi ovozlar"]})]}),u==="against"&&t.status==="voting_open"&&e.jsxs("div",{className:"space-y-4",children:[z&&z.total>0&&e.jsxs("div",{className:"p-3 bg-blue-50 rounded-xl",children:[e.jsx("div",{className:"text-sm font-medium text-blue-800 mb-2",children:r==="ru"?"Статистика запросов на пересмотр":"Qayta ko'rib chiqish so'rovlari statistikasi"}),e.jsxs("div",{className:"grid grid-cols-3 gap-2 text-xs",children:[e.jsxs("div",{children:[e.jsx("span",{className:"text-blue-600",children:r==="ru"?"Отправлено:":"Yuborildi:"})," ",z.total]}),e.jsxs("div",{children:[e.jsx("span",{className:"text-green-600",children:r==="ru"?"Изменили:":"O'zgartirildi:"})," ",z.voteChanged]}),e.jsxs("div",{children:[e.jsx("span",{className:"text-gray-600",children:r==="ru"?"Конверсия:":"Konversiya:"})," ",z.conversionRate,"%"]})]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:r==="ru"?"Выберите вопрос:":"Savolni tanlang:"}),e.jsx("select",{value:b||"",onChange:i=>v(i.target.value),className:"w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent",children:t.agendaItems.map((i,$)=>e.jsxs("option",{value:i.id,children:[$+1,". ",i.title]},i.id))})]}),P?e.jsx("div",{className:"text-center py-8 text-gray-500",children:r==="ru"?"Загрузка...":"Yuklanmoqda..."}):N.length===0?e.jsx("div",{className:"text-center py-8 text-gray-500",children:r==="ru"?"Нет голосов против по этому вопросу":"Bu savol bo'yicha qarshi ovozlar yo'q"}):e.jsx("div",{className:"space-y-3",children:N.map(i=>e.jsx("div",{className:"p-4 bg-gray-50 rounded-xl border border-gray-200",children:e.jsxs("div",{className:"flex items-start justify-between gap-4",children:[e.jsxs("div",{className:"flex-1",children:[e.jsx("div",{className:"font-medium",children:i.voterName}),e.jsxs("div",{className:"text-sm text-gray-500 flex items-center gap-4",children:[e.jsxs("span",{children:[r==="ru"?"Кв.":"Kv."," ",i.apartmentNumber]}),e.jsxs("span",{children:[i.voteWeight," ",r==="ru"?"кв.м":"kv.m"]}),i.phone&&e.jsxs("span",{className:"flex items-center gap-1",children:[e.jsx(pe,{className:"w-3 h-3"}),i.phone]})]}),i.comment&&e.jsxs("div",{className:"mt-2 p-2 bg-white rounded-lg text-sm text-gray-600",children:[e.jsx(me,{className:"w-3 h-3 inline mr-1"}),i.comment]}),i.requestCount>0&&e.jsx("div",{className:"mt-2 text-xs text-orange-600",children:r==="ru"?`Отправлено запросов: ${i.requestCount}/2`:`Yuborilgan so'rovlar: ${i.requestCount}/2`})]}),e.jsxs("button",{onClick:()=>a({voterId:i.voterId,voterName:i.voterName}),disabled:!i.canSendRequest||m===i.voterId,className:`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${i.canSendRequest?"bg-orange-500 text-white hover:bg-orange-600":"bg-gray-200 text-gray-400 cursor-not-allowed"}`,children:[e.jsx(V,{className:"w-4 h-4"}),r==="ru"?"Запросить":"So'rash"]})]})},i.voteId))})]}),(u==="agenda"||t.status!=="voting_open")&&e.jsxs("div",{children:[e.jsx("h3",{className:"font-medium mb-3",children:r==="ru"?"Повестка дня":"Kun tartibi"}),e.jsx("div",{className:"space-y-4",children:t.agendaItems.map((i,$)=>{const l=p(t.id,i.id);return e.jsx("div",{className:"p-4 rounded-xl bg-gray-50 border border-gray-200",children:e.jsxs("div",{className:"flex items-start justify-between gap-4",children:[e.jsxs("div",{className:"flex-1",children:[e.jsxs("div",{className:"font-medium",children:[$+1,". ",i.title]}),e.jsx("p",{className:"text-sm text-gray-500 mt-1",children:i.description}),["voting_open","voting_closed","results_published","protocol_generated","protocol_approved"].includes(t.status)&&e.jsxs("div",{className:"mt-3 pt-3 border-t border-gray-200",children:[e.jsxs("div",{className:"grid grid-cols-3 gap-2 text-sm",children:[e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx(xe,{className:"w-4 h-4 text-green-500"}),e.jsxs("span",{children:[l.votesFor," (",l.percentFor.toFixed(0),"%)"]})]}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx(Y,{className:"w-4 h-4 text-red-500"}),e.jsx("span",{children:l.votesAgainst})]}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx(he,{className:"w-4 h-4 text-gray-400"}),e.jsx("span",{children:l.votesAbstain})]})]}),e.jsx("div",{className:"mt-2 h-2 bg-gray-200 rounded-full overflow-hidden",children:e.jsx("div",{className:`h-full ${l.thresholdMet?"bg-green-500":"bg-red-500"}`,style:{width:`${l.percentFor}%`}})}),e.jsxs("div",{className:"flex items-center justify-between mt-1 text-xs text-gray-500",children:[e.jsx("span",{children:"0%"}),e.jsxs("span",{children:[r==="ru"?"Порог:":"Chegara:"," ",A[i.threshold].percent,"%"]}),e.jsx("span",{children:"100%"})]})]})]}),i.isApproved!==void 0&&e.jsx("span",{className:`px-2 py-1 rounded-lg text-xs font-medium ${i.isApproved?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`,children:i.isApproved?r==="ru"?"Принято":"Qabul":r==="ru"?"Не принято":"Rad"})]})},i.id)})})]})]}),j&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4",children:e.jsxs("div",{className:"bg-white rounded-2xl w-full max-w-md p-6",children:[e.jsx("h3",{className:"text-lg font-bold mb-4",children:r==="ru"?"Запрос на пересмотр голоса":"Ovozni qayta ko'rib chiqish so'rovi"}),e.jsxs("div",{className:"mb-4 p-3 bg-gray-50 rounded-xl",children:[e.jsx("div",{className:"text-sm text-gray-500",children:r==="ru"?"Получатель:":"Qabul qiluvchi:"}),e.jsx("div",{className:"font-medium",children:j.voterName})]}),e.jsxs("div",{className:"mb-4",children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:r==="ru"?"Причина запроса:":"So'rov sababi:"}),e.jsxs("select",{value:o,onChange:i=>d(i.target.value),className:"w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent",children:[e.jsx("option",{value:"",children:r==="ru"?"Выберите причину...":"Sababni tanlang..."}),W.map(i=>e.jsx("option",{value:i.value,children:i.label},i.value))]})]}),e.jsxs("div",{className:"mb-4",children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:r==="ru"?"Сообщение (необязательно):":"Xabar (ixtiyoriy):"}),e.jsx("textarea",{value:x,onChange:i=>y(i.target.value),placeholder:r==="ru"?"Личное сообщение жителю...":"Aholiga shaxsiy xabar...",className:"w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none",rows:3,maxLength:500}),e.jsxs("div",{className:"text-xs text-gray-400 text-right mt-1",children:[x.length,"/500"]})]}),e.jsxs("div",{className:"p-3 bg-yellow-50 rounded-xl mb-4 text-sm text-yellow-800",children:[e.jsx(te,{className:"w-4 h-4 inline mr-1"}),r==="ru"?"Это только просьба. Житель сам решает, менять голос или нет.":"Bu faqat iltimos. Aholi ovozni o'zgartirish yoki o'zgartirmaslikni o'zi hal qiladi."]}),e.jsxs("div",{className:"flex gap-3",children:[e.jsx("button",{onClick:()=>{a(null),d(""),y("")},className:"flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors",children:r==="ru"?"Отмена":"Bekor qilish"}),e.jsxs("button",{onClick:O,disabled:!o||!!m,className:"flex-1 px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2",children:[e.jsx(V,{className:"w-4 h-4"}),m?r==="ru"?"Отправка...":"Yuborilmoqda...":r==="ru"?"Отправить":"Yuborish"]})]})]})})]})})}export{Fe as MeetingsPage};
//# sourceMappingURL=MeetingsPage-1769428875114-DmQhHLny.js.map
