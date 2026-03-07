import{r as h,j as r,au as H,i as K,B as Z,ac as L,U as J,F as Q,a0 as wr,a1 as rr,X as U,a9 as lr,aM as ir,af as nr,aN as or,h as cr,p as dr,ab as er,N as tr,aO as Y,m as pr,aP as mr,am as V,aQ as xr,ay as hr}from"./react-vendor-1772030750130-W9DWI8FB.js";import{c as ur,u as br,j as vr,k as sr,M as R,A as q,D as A}from"./index-1772030750130-GGXI6RjW.js";import{P as Pr,Q as ar}from"./vendor-1772030750130-Dij79yse.js";import"./zustand-1772030750130-wNUYBKDB.js";import"./qr-scanner-1772030750130-B_vB3SDT.js";const T={name:"OOO KAMIZO",address:"г. Ташкент, Яшнобадский район, ул. Махтумкули, дом 93/3",bank:"«Ориент Финанс» ЧАКБ Миробад филиал",account:"20208000805307918001",inn:"307928888",oked:"81100",mfo:"01071"};function gr(t,s){const e=URL.createObjectURL(t),p=/iPad|iPhone|iPod/.test(navigator.userAgent),c=/^((?!chrome|android).)*safari/i.test(navigator.userAgent);if(p||c)window.open(e,"_blank")||(window.location.href=e),setTimeout(()=>URL.revokeObjectURL(e),1e4);else{const n=document.createElement("a");n.href=e,n.download=s,n.style.display="none",document.body.appendChild(n),n.click(),document.body.removeChild(n),setTimeout(()=>URL.revokeObjectURL(e),100)}}const fr={0:"января",1:"февраля",2:"марта",3:"апреля",4:"мая",5:"июня",6:"июля",7:"августа",8:"сентября",9:"октября",10:"ноября",11:"декабря"};function yr(t){if(!t)return"___";const s=new Date(t);return`${s.getDate()} ${fr[s.getMonth()]} ${s.getFullYear()}`}function jr(t){if(!t)return"___";const s=new Date(t);return`${s.getHours().toString().padStart(2,"0")}:${s.getMinutes().toString().padStart(2,"0")}`}function E(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}function Nr(t,s){const e=t.votes_for_area+t.votes_against_area+t.votes_abstain_area;return{votesFor:t.votes_for_area,votesAgainst:t.votes_against_area,votesAbstain:t.votes_abstain_area,percentFor:e>0?t.votes_for_area/e*100:0,percentAgainst:e>0?t.votes_against_area/e*100:0,percentAbstain:e>0?t.votes_abstain_area/e*100:0}}function X(t){const s=t.split(",")[1],e=atob(s),p=new Uint8Array(e.length);for(let c=0;c<e.length;c++)p[c]=e.charCodeAt(c);return p}async function zr(){const t=[`Компания: ${T.name}`,`Адрес: ${T.address}`,`Банк: ${T.bank}`,`Р/С: ${T.account}`,`ИНН: ${T.inn}`,`ОКЭД: ${T.oked}`,`МФО: ${T.mfo}`].join(`
`);return await ar.toDataURL(t,{width:150,margin:1,color:{dark:"#1f2937",light:"#ffffff"}})}async function _r(t,s,e){const p=["ЭЛЕКТРОННАЯ ПОДПИСЬ",`Протокол: ${s}`,`ФИО: ${t.voter_name}`,`Квартира: ${t.apartment_number||"-"}`,`Площадь: ${t.vote_weight?.toFixed(2)||"-"} кв.м`,`Голос: ${t.choice==="for"?"ЗА":t.choice==="against"?"ПРОТИВ":"ВОЗДЕРЖАЛСЯ"}`,`Дата: ${new Date(t.voted_at).toLocaleString("ru-RU")}`,`Адрес: ${e}`].join(`
`);return await ar.toDataURL(p,{width:80,margin:1,color:{dark:"#1f2937",light:"#ffffff"}})}function G(t){return`
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
</w:tbl>`}function $r(t,s){let e=`
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
  </w:tr>`;return t.forEach((p,c)=>{const n=new Date(p.voted_at),f=p.choice==="for"?"ЗА":p.choice==="against"?"ПРОТИВ":"ВОЗДЕРЖ.",P=s.get(p.voter_id),u=P?`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="600000" cy="600000"/><wp:docPr id="${1e3+c}" name="QR Signature ${c}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="voter_qr_${c}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${P}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="600000" cy="600000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`:"<w:r><w:t>✓</w:t></w:r>";e+=`
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
  </w:tr>`}),e+="</w:tbl>",e}function Cr(t,s){if(!s||s.length===0)return"";const e=s.some(c=>c.comment&&c.comment.trim().length>0);let p=`
<w:p><w:pPr><w:spacing w:before="100"/><w:rPr><w:i/><w:sz w:val="18"/></w:rPr></w:pPr>
<w:r><w:rPr><w:i/><w:sz w:val="18"/></w:rPr><w:t>Голоса участников:</w:t></w:r></w:p>
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="${e?"10500":"9000"}" w:type="dxa"/>
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
    <w:gridCol w:w="${e?"2500":"3500"}"/>
    <w:gridCol w:w="800"/>
    <w:gridCol w:w="1200"/>
    <w:gridCol w:w="1500"/>
    ${e?'<w:gridCol w:w="4000"/>':""}
  </w:tblGrid>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>№</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="${e?"2500":"3500"}" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
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
    ${e?`<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/><w:shd w:val="clear" w:fill="E7E6E6"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Обоснование</w:t></w:r></w:p>
    </w:tc>`:""}
  </w:tr>`;return s.forEach((c,n)=>{const f=c.choice==="for"?"ЗА":c.choice==="against"?"ПРОТИВ":"ВОЗДЕРЖАЛСЯ",P=c.comment?.trim()||"";p+=`
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${n+1}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="${e?"2500":"3500"}" w:type="dxa"/></w:tcPr>
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
    ${e?`<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:rPr><w:sz w:val="14"/><w:i/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="14"/><w:i/></w:rPr><w:t>${E(P)}</w:t></w:r></w:p>
    </w:tc>`:""}
  </w:tr>`}),p+="</w:tbl>",p}async function kr(t){const{meeting:s,agendaItems:e,voteRecords:p,votesByItem:c}=t,n=s.buildingAddress||s.building_address||"Адрес не указан",f=yr(s.confirmed_date_time||s.voting_opened_at),P=jr(s.confirmed_date_time||s.voting_opened_at),u=s.location||n,I=s.format==="online"?"заочной":s.format==="hybrid"?"очно-заочной":"очной",b=await zr(),v=new Map,N=new Map;for(let d=0;d<p.length;d++){const x=p[d],j=await _r(x,s.number,n);v.set(x.voter_id,j),N.set(x.voter_id,`rId${200+d}`)}let w="";w+=`
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
`,e.forEach((d,x)=>{const j=Nr(d,s.total_area),z=x+2,C=j.percentFor>50,k=c[d.id]||[];w+=`
<w:p><w:pPr><w:spacing w:before="300" w:after="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>${z}. ${E(d.title)}</w:t></w:r></w:p>
${d.description?`<w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>СЛУШАЛИ: ${E(d.description)}</w:t></w:r></w:p>`:""}
<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>ГОЛОСОВАЛИ:</w:t></w:r></w:p>
${G(j)}
${Cr(d,k)}
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
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${P}</w:t></w:r></w:p>

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
    ${e.map((d,x)=>`
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

    ${$r(p,N)}

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
</w:document>`,m=new Pr,_=X(b);m.file("word/media/uk_qr.png",_);for(const[d,x]of v){const j=X(x),z=p.findIndex(C=>C.voter_id===d);m.file(`word/media/voter_qr_${z}.png`,j)}let y=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId100" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/uk_qr.png"/>`;for(let d=0;d<p.length;d++)y+=`
  <Relationship Id="rId${200+d}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/voter_qr_${d}.png"/>`;y+=`
</Relationships>`,m.file("[Content_Types].xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`),m.file("_rels/.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`),m.file("word/_rels/document.xml.rels",y),m.file("word/document.xml",S);const a=m.generate({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}),o=`Протокол_${s.number}_${n.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g,"_")}.docx`;gr(a,o)}function Fr(){const{user:t}=ur(),{t:s,language:e}=br(),{buildings:p,fetchBuildings:c}=vr(),{meetings:n,fetchMeetings:f,createMeeting:P,approveMeeting:u,rejectMeeting:I,confirmSchedule:b,openVoting:v,closeVoting:N,publishResults:w,generateProtocol:g,approveProtocol:S,deleteMeeting:m,calculateAgendaItemResult:_,calculateMeetingQuorum:y}=sr();h.useEffect(()=>{f(),c()},[f,c]);const[a,o]=h.useState("all"),[d,x]=h.useState(!1),[j,z]=h.useState(null),[C,k]=h.useState(!1),F=h.useMemo(()=>{switch(a){case"active":return n.filter(l=>["schedule_poll_open","schedule_confirmed","voting_open"].includes(l.status));case"completed":return n.filter(l=>["voting_closed","results_published","protocol_generated","protocol_approved"].includes(l.status));case"pending":return n.filter(l=>["draft","pending_moderation"].includes(l.status));default:return n}},[n,a]),M=l=>R[l]?.color||"gray",O=l=>{const D=R[l];return e==="ru"?D?.label:D?.labelUz},W=l=>new Date(l).toLocaleDateString(e==="ru"?"ru-RU":"uz-UZ",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}),B=l=>{z(l),k(!0)},i=async l=>{confirm(e==="ru"?"Удалить собрание? Это действие необратимо.":"Yig'ilishni o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.")&&await m(l)},$=[{id:"all",label:e==="ru"?"Все":"Barchasi",count:n.length},{id:"active",label:e==="ru"?"Активные":"Faol",count:n.filter(l=>["schedule_poll_open","schedule_confirmed","voting_open"].includes(l.status)).length},{id:"pending",label:e==="ru"?"Ожидают":"Kutmoqda",count:n.filter(l=>["draft","pending_moderation"].includes(l.status)).length},{id:"completed",label:e==="ru"?"Завершены":"Tugallangan",count:n.filter(l=>["voting_closed","results_published","protocol_generated","protocol_approved"].includes(l.status)).length}];return r.jsxs("div",{className:"space-y-6",children:[r.jsxs("div",{className:"flex items-center justify-between",children:[r.jsxs("div",{children:[r.jsx("h1",{className:"text-2xl font-bold text-gray-900",children:s("meetings.title")}),r.jsx("p",{className:"text-gray-500",children:s("meetings.subtitle")})]}),r.jsxs("button",{onClick:()=>x(!0),className:"btn-primary flex items-center gap-2",children:[r.jsx(H,{className:"w-5 h-5"}),s("meetings.create")]})]}),r.jsx("div",{className:"flex gap-2 flex-wrap",children:$.map(l=>r.jsxs("button",{onClick:()=>o(l.id),className:`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${a===l.id?"bg-primary-400 text-gray-900":"bg-white text-gray-600 hover:bg-gray-100"}`,children:[l.label,l.count>0&&r.jsx("span",{className:"ml-1 px-2 py-0.5 rounded-full bg-gray-900/10 text-xs",children:l.count})]},l.id))}),r.jsx("div",{className:"space-y-4",children:F.length===0?r.jsxs("div",{className:"glass-card p-12 text-center",children:[r.jsx(K,{className:"w-16 h-16 mx-auto text-gray-300 mb-4"}),r.jsx("h3",{className:"text-lg font-medium text-gray-600 mb-2",children:s("meetings.noMeetings")}),r.jsx("p",{className:"text-gray-400",children:s("meetings.createFirst")})]}):F.map(l=>r.jsx(Ir,{meeting:l,language:e,getStatusColor:M,getStatusLabel:O,formatDate:W,onViewDetails:()=>B(l),onApprove:()=>u(l.id),onReject:D=>I(l.id,D),onConfirmSchedule:()=>b(l.id),onOpenVoting:()=>v(l.id),onCloseVoting:()=>N(l.id),onPublishResults:()=>w(l.id),onGenerateProtocol:()=>g(l.id),onApproveProtocol:()=>S(l.id),onDelete:()=>i(l.id),calculateQuorum:()=>y(l.id),user:t},l.id))}),d&&r.jsx(Sr,{onClose:()=>x(!1),onCreate:async l=>{try{await P(l),await f(),x(!1)}catch{}},language:e,user:t,buildings:p.map(l=>({id:l.id,name:l.name,address:l.address}))}),C&&j&&r.jsx(qr,{meeting:j,onClose:()=>{k(!1),z(null)},language:e,calculateResult:_,calculateQuorum:()=>y(j.id)})]})}function Ir({meeting:t,language:s,getStatusColor:e,getStatusLabel:p,formatDate:c,onViewDetails:n,onApprove:f,onReject:P,onConfirmSchedule:u,onOpenVoting:I,onCloseVoting:b,onPublishResults:v,onGenerateProtocol:N,onApproveProtocol:w,onDelete:g,calculateQuorum:S,user:m}){const _=S(),y=e(t.status),a={gray:"bg-gray-100 text-gray-700",yellow:"bg-yellow-100 text-orange-700",blue:"bg-blue-100 text-blue-700",indigo:"bg-indigo-100 text-indigo-700",green:"bg-green-100 text-green-700",orange:"bg-orange-100 text-orange-700",purple:"bg-purple-100 text-purple-700",teal:"bg-teal-100 text-teal-700",emerald:"bg-emerald-100 text-emerald-700",red:"bg-red-100 text-red-700"};return r.jsxs("div",{className:"glass-card p-5 hover:shadow-lg transition-shadow",children:[r.jsxs("div",{className:"flex items-start justify-between gap-4",children:[r.jsxs("div",{className:"flex-1 min-w-0",children:[r.jsxs("div",{className:"flex items-center gap-3 mb-3 flex-wrap",children:[r.jsx("span",{className:`px-3 py-1 rounded-lg text-sm font-medium ${a[y]||a.gray}`,children:p(t.status)}),r.jsxs("span",{className:"text-sm text-gray-500",children:["#",t.number]}),r.jsx("span",{className:`px-2 py-0.5 rounded text-xs font-medium ${t.format==="online"?"bg-blue-50 text-blue-600":t.format==="offline"?"bg-green-50 text-green-600":"bg-purple-50 text-purple-600"}`,children:t.format==="online"?s==="ru"?"Онлайн":"Onlayn":t.format==="offline"?s==="ru"?"Очное":"Yuzma-yuz":s==="ru"?"Смешанное":"Aralash"})]}),r.jsxs("div",{className:"flex items-center gap-4 text-sm text-gray-600 mb-2",children:[r.jsxs("span",{className:"flex items-center gap-1",children:[r.jsx(Z,{className:"w-4 h-4"}),t.buildingAddress]}),t.confirmedDateTime&&r.jsxs("span",{className:"flex items-center gap-1",children:[r.jsx(L,{className:"w-4 h-4"}),c(t.confirmedDateTime)]})]}),r.jsxs("div",{className:"flex items-center gap-2 text-sm text-gray-500 mb-3",children:[r.jsx(J,{className:"w-4 h-4"}),r.jsx("span",{children:t.organizerName}),r.jsxs("span",{className:"text-gray-400",children:["(",t.organizerType==="resident"?s==="ru"?"Житель":"Aholi":s==="ru"?"УК":"UK",")"]})]}),r.jsxs("div",{className:"flex items-center gap-2 text-sm",children:[r.jsx(Q,{className:"w-4 h-4 text-gray-400"}),r.jsxs("span",{className:"text-gray-600",children:[t.agendaItems.length," ",s==="ru"?"вопросов в повестке":"savol kun tartibida"]})]}),t.status==="schedule_poll_open"&&t.scheduleOptions&&t.scheduleOptions.length>0&&r.jsxs("div",{className:"mt-3 pt-3 border-t border-gray-100",children:[r.jsxs("div",{className:"text-sm font-medium text-gray-700 mb-2 flex items-center gap-2",children:[r.jsx(L,{className:"w-4 h-4 text-blue-500"}),s==="ru"?"Голосование за дату:":"Sana uchun ovoz berish:"]}),r.jsx("div",{className:"space-y-1",children:t.scheduleOptions.map(o=>{const d=t.scheduleOptions.reduce((C,k)=>C+(k.voteCount??k.votes?.length??0),0),x=o.voteCount??o.votes?.length??0,j=d>0?x/d*100:0,z=x>0&&x===Math.max(...t.scheduleOptions.map(C=>C.voteCount??C.votes?.length??0));return r.jsxs("div",{className:"flex items-center gap-2 text-sm",children:[r.jsxs("div",{className:`flex-1 flex items-center gap-2 ${z?"font-medium text-blue-700":"text-gray-600"}`,children:[r.jsx("span",{children:c(o.dateTime)}),z&&x>0&&r.jsx("span",{className:"text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded",children:s==="ru"?"Лидер":"Yetakchi"})]}),r.jsxs("div",{className:"flex items-center gap-2",children:[r.jsx("div",{className:"w-20 h-2 bg-gray-100 rounded-full overflow-hidden",children:r.jsx("div",{className:"h-full bg-blue-500 rounded-full transition-all",style:{width:`${j}%`}})}),r.jsxs("span",{className:"text-xs text-gray-500 w-12 text-right",children:[x," (",j.toFixed(0),"%)"]})]})]},o.id)})}),r.jsxs("div",{className:"text-xs text-gray-400 mt-2",children:[s==="ru"?"Всего голосов: ":"Jami ovozlar: ",t.scheduleOptions.reduce((o,d)=>o+(d.voteCount??d.votes?.length??0),0)]})]}),["voting_open","voting_closed","results_published","protocol_generated","protocol_approved"].includes(t.status)&&r.jsxs("div",{className:"flex items-center gap-4 mt-3 pt-3 border-t border-gray-100",children:[r.jsxs("div",{className:"flex items-center gap-2",children:[r.jsx(K,{className:"w-4 h-4 text-gray-400"}),r.jsxs("span",{className:"text-sm",children:[_.participated,"/",_.total," (",_.percent.toFixed(1),"%)"]})]}),r.jsx("span",{className:`text-xs px-2 py-0.5 rounded-full font-medium ${_.quorumReached?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`,children:_.quorumReached?s==="ru"?"Кворум есть":"Kvorum bor":s==="ru"?"Нет кворума":"Kvorum yo'q"})]})]}),r.jsxs("div",{className:"flex flex-col gap-2",children:[r.jsx("button",{onClick:n,className:"p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors",title:s==="ru"?"Подробнее":"Batafsil",children:r.jsx(wr,{className:"w-5 h-5"})}),t.status==="pending_moderation"&&(m?.role==="admin"||m?.role==="manager"||m?.role==="director")&&r.jsxs(r.Fragment,{children:[r.jsx("button",{onClick:f,className:"p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors",title:s==="ru"?"Одобрить":"Tasdiqlash",children:r.jsx(rr,{className:"w-5 h-5"})}),r.jsx("button",{onClick:()=>P(s==="ru"?"Отклонено модератором":"Moderator tomonidan rad etildi"),className:"p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors",title:s==="ru"?"Отклонить":"Rad etish",children:r.jsx(U,{className:"w-5 h-5"})})]}),(m?.role==="admin"||m?.role==="manager"||m?.role==="director")&&r.jsx("button",{onClick:g,className:"p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors",title:s==="ru"?"Удалить":"O'chirish",children:r.jsx(lr,{className:"w-5 h-5"})})]})]}),(m?.role==="admin"||m?.role==="manager"||m?.role==="director")&&r.jsxs("div",{className:"mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2",children:[t.status==="schedule_poll_open"&&r.jsxs("button",{onClick:u,className:"flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium",children:[r.jsx(ir,{className:"w-4 h-4"}),s==="ru"?"Подтвердить дату":"Sanani tasdiqlash"]}),t.status==="schedule_confirmed"&&r.jsxs("button",{onClick:I,className:"flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm font-medium",children:[r.jsx(nr,{className:"w-4 h-4"}),s==="ru"?"Открыть голосование":"Ovoz berishni ochish"]}),t.status==="voting_open"&&r.jsxs("button",{onClick:b,className:"flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm font-medium",children:[r.jsx(or,{className:"w-4 h-4"}),s==="ru"?"Закрыть голосование":"Ovoz berishni yopish"]}),t.status==="voting_closed"&&r.jsxs("button",{onClick:v,className:"flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors text-sm font-medium",children:[r.jsx(cr,{className:"w-4 h-4"}),s==="ru"?"Опубликовать итоги":"Natijalarni e'lon qilish"]}),t.status==="results_published"&&r.jsxs("button",{onClick:N,className:"flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-colors text-sm font-medium",children:[r.jsx(Q,{className:"w-4 h-4"}),s==="ru"?"Сформировать протокол":"Bayonnoma yaratish"]}),t.status==="protocol_generated"&&r.jsxs("button",{onClick:w,className:"flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors text-sm font-medium",children:[r.jsx(dr,{className:"w-4 h-4"}),s==="ru"?"Подписать протокол":"Bayonnomani imzolash"]}),t.status==="protocol_approved"&&r.jsxs("button",{onClick:n,className:"flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium",children:[r.jsx(er,{className:"w-4 h-4"}),s==="ru"?"Скачать протокол":"Bayonnomani yuklab olish"]})]})]})}function Sr({onClose:t,onCreate:s,language:e,user:p,buildings:c}){const[n,f]=h.useState(1),[P,u]=h.useState(!1),[I,b]=h.useState(!1),[v,N]=h.useState({title:"",description:"",threshold:"simple_majority"}),[w,g]=h.useState({buildingId:p?.buildingId||(c.length>0?c[0].id:""),buildingAddress:c.length>0?c[0].address:"",organizerType:"management",format:"online",agendaItems:[],customItems:[],location:"",description:"",meetingTime:"19:00"}),S=a=>{const o=c.find(d=>d.id===a);g({...w,buildingId:a,buildingAddress:o?.address||""})},m=a=>{w.agendaItems.includes(a)?g({...w,agendaItems:w.agendaItems.filter(o=>o!==a)}):g({...w,agendaItems:[...w.agendaItems,a]})},_=async()=>{if(!p||!w.buildingId||P)return;u(!0);const a=[...w.agendaItems.map(o=>({type:o,title:e==="ru"?q[o].label:q[o].labelUz,description:e==="ru"?q[o].description:q[o].descriptionUz,threshold:q[o].defaultThreshold,materials:[]})),...w.customItems.map(o=>({type:"other",title:o.title,description:o.description,threshold:o.threshold,materials:[]}))];try{await s({buildingId:w.buildingId,buildingAddress:w.buildingAddress,organizerType:w.organizerType,organizerId:p.id,organizerName:p.name,format:w.format,agendaItems:a,location:w.location||void 0,description:w.description||void 0,meetingTime:w.meetingTime||"19:00"})}finally{u(!1)}},y=[{num:1,label:e==="ru"?"Тип":"Turi"},{num:2,label:e==="ru"?"Повестка":"Kun tartibi"},{num:3,label:e==="ru"?"Публикация":"Nashr"}];return r.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4",children:r.jsxs("div",{className:"bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto",children:[r.jsxs("div",{className:"p-6 border-b border-gray-100 flex items-center justify-between",children:[r.jsxs("div",{children:[r.jsx("h2",{className:"text-xl font-bold",children:e==="ru"?"Созвать собрание":"Yig'ilish chaqirish"}),r.jsx("p",{className:"text-sm text-gray-500",children:e==="ru"?`Шаг ${n} из 3`:`Bosqich ${n} dan 3`})]}),r.jsx("button",{onClick:t,className:"p-2 hover:bg-gray-100 rounded-xl transition-colors",children:r.jsx(U,{className:"w-5 h-5"})})]}),r.jsx("div",{className:"px-6 py-4 border-b border-gray-100",children:r.jsx("div",{className:"flex items-center justify-between",children:y.map((a,o)=>r.jsxs("div",{className:"flex items-center",children:[r.jsx("div",{className:`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${n>=a.num?"bg-primary-400 text-gray-900":"bg-gray-200 text-gray-500"}`,children:a.num}),r.jsx("span",{className:`ml-2 text-sm ${n>=a.num?"text-gray-900":"text-gray-500"}`,children:a.label}),o<y.length-1&&r.jsx("div",{className:`w-16 h-1 mx-4 rounded ${n>a.num?"bg-primary-400":"bg-gray-200"}`})]},a.num))})}),r.jsxs("div",{className:"p-6 space-y-6",children:[n===1&&r.jsxs(r.Fragment,{children:[r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-3",children:e==="ru"?"Выберите дом":"Uyni tanlang"}),c.length===0?r.jsx("div",{className:"p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800",children:e==="ru"?"Нет доступных домов. Сначала добавьте дом в системе.":"Mavjud uylar yo'q. Avval tizimda uy qo'shing."}):r.jsx("select",{value:w.buildingId,onChange:a=>S(a.target.value),className:"w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-400 focus:border-primary-400",children:c.map(a=>r.jsxs("option",{value:a.id,children:[a.name," - ",a.address]},a.id))})]}),r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-3",children:e==="ru"?"Организатор":"Tashkilotchi"}),r.jsxs("div",{className:"grid grid-cols-2 gap-3",children:[r.jsxs("button",{onClick:()=>g({...w,organizerType:"management"}),className:`p-4 rounded-xl border-2 transition-colors ${w.organizerType==="management"?"border-primary-400 bg-primary-50":"border-gray-200 hover:border-gray-300"}`,children:[r.jsx(Z,{className:"w-6 h-6 mb-2 mx-auto text-gray-600"}),r.jsx("div",{className:"text-sm font-medium",children:e==="ru"?"Управляющая компания":"Boshqaruv kompaniyasi"})]}),r.jsxs("button",{onClick:()=>g({...w,organizerType:"resident"}),className:`p-4 rounded-xl border-2 transition-colors ${w.organizerType==="resident"?"border-primary-400 bg-primary-50":"border-gray-200 hover:border-gray-300"}`,children:[r.jsx(J,{className:"w-6 h-6 mb-2 mx-auto text-gray-600"}),r.jsx("div",{className:"text-sm font-medium",children:e==="ru"?"Житель (инициатива)":"Aholi (tashabbusi)"})]})]})]}),r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-3",children:e==="ru"?"Формат проведения":"O'tkazish formati"}),r.jsx("div",{className:"grid grid-cols-3 gap-3",children:["online","offline","hybrid"].map(a=>r.jsx("button",{onClick:()=>g({...w,format:a}),className:`p-3 rounded-xl border-2 transition-colors ${w.format===a?"border-primary-400 bg-primary-50":"border-gray-200 hover:border-gray-300"}`,children:r.jsx("div",{className:"text-sm font-medium",children:a==="online"?e==="ru"?"Онлайн":"Onlayn":a==="offline"?e==="ru"?"Очное":"Yuzma-yuz":e==="ru"?"Смешанное":"Aralash"})},a))})]}),w.format!=="online"&&r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:e==="ru"?"Место проведения":"O'tkazish joyi"}),r.jsx("input",{type:"text",value:w.location,onChange:a=>g({...w,location:a.target.value}),className:"glass-input",placeholder:e==="ru"?"Например: Холл 1 этажа":"Masalan: 1-qavat zali"})]}),r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:e==="ru"?"Время проведения":"O'tkazish vaqti"}),r.jsx("input",{type:"time",value:w.meetingTime,onChange:a=>g({...w,meetingTime:a.target.value}),className:"glass-input"}),r.jsx("p",{className:"text-xs text-gray-500 mt-1",children:e==="ru"?"Время для всех вариантов дат в голосовании":"Ovoz berishdagi barcha sanalar uchun vaqt"})]}),r.jsxs("div",{children:[r.jsxs("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:[e==="ru"?"Обоснование собрания":"Yig'ilish asoslashi",r.jsxs("span",{className:"text-gray-400 font-normal ml-1",children:["(",e==="ru"?"необязательно":"ixtiyoriy",")"]})]}),r.jsx("textarea",{value:w.description,onChange:a=>g({...w,description:a.target.value}),className:"glass-input min-h-[80px] resize-none",placeholder:e==="ru"?"Опишите причину созыва собрания и что планируется обсудить...":"Yig'ilish sababi va nimalar muhokama qilinishini tasvirlang...",rows:3})]})]}),n===2&&r.jsxs(r.Fragment,{children:[r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-3",children:e==="ru"?"Выберите вопросы повестки":"Kun tartibi savollarini tanlang"}),r.jsx("div",{className:"space-y-2 max-h-96 overflow-y-auto",children:Object.keys(q).map(a=>{const o=q[a],d=w.agendaItems.includes(a);return r.jsx("button",{onClick:()=>m(a),className:`w-full p-4 rounded-xl border-2 text-left transition-colors ${d?"border-primary-400 bg-primary-50":"border-gray-200 hover:border-gray-300"}`,children:r.jsxs("div",{className:"flex items-start justify-between",children:[r.jsxs("div",{children:[r.jsx("div",{className:"font-medium",children:e==="ru"?o.label:o.labelUz}),r.jsx("div",{className:"text-sm text-gray-500 mt-1",children:e==="ru"?o.description:o.descriptionUz}),r.jsxs("div",{className:"flex items-center gap-2 mt-2",children:[r.jsx("span",{className:"text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600",children:e==="ru"?A[o.defaultThreshold].label:A[o.defaultThreshold].labelUz}),o.requiresMaterials&&r.jsx("span",{className:"text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-600",children:e==="ru"?"Нужны материалы":"Materiallar kerak"})]})]}),r.jsx("div",{className:`w-6 h-6 rounded-full border-2 flex items-center justify-center ${d?"border-primary-400 bg-primary-400":"border-gray-300"}`,children:d&&r.jsx(rr,{className:"w-4 h-4 text-gray-900"})})]})},a)})})]}),r.jsxs("div",{className:"mt-6 pt-6 border-t border-gray-200",children:[r.jsxs("div",{className:"flex items-center justify-between mb-3",children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700",children:e==="ru"?"Свои вопросы":"O'z savollaringiz"}),r.jsxs("button",{type:"button",onClick:()=>b(!0),className:"text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1",children:[r.jsx(H,{className:"w-4 h-4"}),e==="ru"?"Добавить вопрос":"Savol qo'shish"]})]}),w.customItems.length>0&&r.jsx("div",{className:"space-y-2 mb-4",children:w.customItems.map((a,o)=>r.jsx("div",{className:"p-3 rounded-xl border-2 border-primary-400 bg-primary-50",children:r.jsxs("div",{className:"flex items-start justify-between",children:[r.jsxs("div",{className:"flex-1",children:[r.jsx("div",{className:"font-medium",children:a.title}),a.description&&r.jsx("div",{className:"text-sm text-gray-500 mt-1",children:a.description}),r.jsx("span",{className:"text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 mt-2 inline-block",children:e==="ru"?A[a.threshold].label:A[a.threshold].labelUz})]}),r.jsx("button",{onClick:()=>g({...w,customItems:w.customItems.filter((d,x)=>x!==o)}),className:"p-1 text-red-500 hover:bg-red-50 rounded",children:r.jsx(U,{className:"w-4 h-4"})})]})},o))}),I&&r.jsxs("div",{className:"p-4 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 space-y-3",children:[r.jsx("input",{type:"text",value:v.title,onChange:a=>N({...v,title:a.target.value}),className:"glass-input",placeholder:e==="ru"?"Название вопроса *":"Savol nomi *"}),r.jsx("textarea",{value:v.description,onChange:a=>N({...v,description:a.target.value}),className:"glass-input min-h-[60px] resize-none",placeholder:e==="ru"?"Описание (необязательно)":"Tavsif (ixtiyoriy)",rows:2}),r.jsxs("div",{children:[r.jsx("label",{className:"block text-xs text-gray-500 mb-1",children:e==="ru"?"Порог принятия":"Qabul qilish chegarasi"}),r.jsx("select",{value:v.threshold,onChange:a=>N({...v,threshold:a.target.value}),className:"glass-input text-sm",children:Object.keys(A).map(a=>r.jsx("option",{value:a,children:e==="ru"?A[a].label:A[a].labelUz},a))})]}),r.jsxs("div",{className:"flex gap-2",children:[r.jsx("button",{type:"button",onClick:()=>{v.title.trim()&&(g({...w,customItems:[...w.customItems,{...v}]}),N({title:"",description:"",threshold:"simple_majority"}),b(!1))},disabled:!v.title.trim(),className:"flex-1 py-2 px-4 bg-primary-400 hover:bg-primary-500 text-gray-900 rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed",children:e==="ru"?"Добавить":"Qo'shish"}),r.jsx("button",{type:"button",onClick:()=>{b(!1),N({title:"",description:"",threshold:"simple_majority"})},className:"py-2 px-4 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium text-sm",children:e==="ru"?"Отмена":"Bekor qilish"})]})]})]}),w.agendaItems.length===0&&w.customItems.length===0&&r.jsx("p",{className:"text-sm text-red-500",children:e==="ru"?"Выберите хотя бы один вопрос или добавьте свой":"Kamida bitta savol tanlang yoki o'zingiznikini qo'shing"})]}),n===3&&r.jsx(r.Fragment,{children:r.jsxs("div",{className:"space-y-4",children:[r.jsxs("div",{className:"p-4 rounded-xl bg-gray-50",children:[r.jsx("h3",{className:"font-medium mb-3",children:e==="ru"?"Сводка":"Xulosa"}),r.jsxs("div",{className:"space-y-2 text-sm",children:[r.jsxs("div",{className:"flex justify-between",children:[r.jsx("span",{className:"text-gray-500",children:e==="ru"?"Формат:":"Format:"}),r.jsx("span",{className:"font-medium",children:w.format==="online"?e==="ru"?"Онлайн":"Onlayn":w.format==="offline"?e==="ru"?"Очное":"Yuzma-yuz":e==="ru"?"Смешанное":"Aralash"})]}),r.jsxs("div",{className:"flex justify-between",children:[r.jsx("span",{className:"text-gray-500",children:e==="ru"?"Дом:":"Uy:"}),r.jsx("span",{className:"font-medium",children:c.find(a=>a.id===w.buildingId)?.name||w.buildingAddress})]}),r.jsxs("div",{className:"flex justify-between",children:[r.jsx("span",{className:"text-gray-500",children:e==="ru"?"Организатор:":"Tashkilotchi:"}),r.jsx("span",{className:"font-medium",children:w.organizerType==="management"?e==="ru"?"УК":"UK":e==="ru"?"Житель":"Aholi"})]}),r.jsxs("div",{className:"flex justify-between",children:[r.jsx("span",{className:"text-gray-500",children:e==="ru"?"Вопросов:":"Savollar:"}),r.jsx("span",{className:"font-medium",children:w.agendaItems.length})]})]})]}),r.jsx("div",{className:"p-4 rounded-xl bg-blue-50 border border-blue-200",children:r.jsxs("div",{className:"flex items-start gap-3",children:[r.jsx(tr,{className:"w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5"}),r.jsx("div",{className:"text-sm text-blue-700",children:e==="ru"?"После публикации жильцам будет отправлено уведомление. Они смогут проголосовать за удобную дату проведения собрания.":"Nashrdan so'ng aholiga bildirishnoma yuboriladi. Ular yig'ilish uchun qulay sanani tanlashlari mumkin bo'ladi."})]})}),r.jsxs("div",{className:"p-4 rounded-xl bg-yellow-50 border border-yellow-200",children:[r.jsx("h4",{className:"font-medium mb-2",children:e==="ru"?"Повестка дня:":"Kun tartibi:"}),r.jsxs("ol",{className:"list-decimal list-inside space-y-1 text-sm",children:[w.agendaItems.map(a=>r.jsx("li",{children:e==="ru"?q[a].label:q[a].labelUz},a)),w.customItems.map((a,o)=>r.jsxs("li",{className:"text-blue-700",children:[a.title,r.jsxs("span",{className:"text-xs text-gray-500 ml-1",children:["(",e==="ru"?"свой вопрос":"o'z savoli",")"]})]},`custom-${o}`))]})]}),w.description&&r.jsxs("div",{className:"p-4 rounded-xl bg-gray-50 border border-gray-200",children:[r.jsx("h4",{className:"font-medium mb-2",children:e==="ru"?"Обоснование:":"Asoslash:"}),r.jsx("p",{className:"text-sm text-gray-600",children:w.description})]})]})})]}),r.jsxs("div",{className:"p-6 border-t border-gray-100 flex gap-3",children:[n>1&&r.jsx("button",{onClick:()=>f(n-1),disabled:P,className:"flex-1 py-3 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50",children:e==="ru"?"Назад":"Orqaga"}),n<3?r.jsx("button",{onClick:()=>f(n+1),disabled:n===1&&!w.buildingId||n===2&&w.agendaItems.length===0&&w.customItems.length===0,className:"flex-1 py-3 rounded-xl font-medium bg-primary-400 text-gray-900 hover:bg-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",children:e==="ru"?"Далее":"Keyingi"}):r.jsx("button",{onClick:_,disabled:P||!w.buildingId,className:"flex-1 py-3 rounded-xl font-medium bg-primary-400 text-gray-900 hover:bg-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",children:P?e==="ru"?"Создание...":"Yaratilmoqda...":e==="ru"?"Опубликовать":"Nashr qilish"})]})]})})}function qr({meeting:t,onClose:s,language:e,calculateResult:p,calculateQuorum:c}){const n=c(),[f,P]=h.useState(!1),[u,I]=h.useState("agenda"),[b,v]=h.useState(null),[N,w]=h.useState([]),[g,S]=h.useState(!1),[m,_]=h.useState(null),[y,a]=h.useState(null),[o,d]=h.useState(""),[x,j]=h.useState(""),[z,C]=h.useState(null),{fetchAgainstVotes:k,sendReconsiderationRequest:F,fetchReconsiderationStats:M}=sr();h.useEffect(()=>{u==="against"&&b&&(S(!0),k(t.id,b).then(i=>{w(i),S(!1)}))},[u,b,t.id,k]),h.useEffect(()=>{u==="against"&&M(t.id).then(i=>{C(i)})},[u,t.id,M]),h.useEffect(()=>{u==="against"&&!b&&t.agendaItems.length>0&&v(t.agendaItems[0].id)},[u,b,t.agendaItems]);const O=async()=>{if(!y||!b||!o)return;_(y.voterId);const i=await F(t.id,{agendaItemId:b,residentId:y.voterId,reason:o,messageToResident:x||void 0});if(i.success){const $=await k(t.id,b);w($),a(null),d(""),j("")}else alert(i.error||(e==="ru"?"Ошибка при отправке запроса":"So'rovni yuborishda xatolik"));_(null)},W=[{value:"discussed_personally",label:e==="ru"?"Обсудили лично":"Shaxsan muhokama qildik"},{value:"new_information",label:e==="ru"?"Появилась новая информация":"Yangi ma'lumot paydo bo'ldi"},{value:"clarification_needed",label:e==="ru"?"Требуется уточнение":"Aniqlik kiritish kerak"},{value:"other",label:e==="ru"?"Другое":"Boshqa"}],B=async()=>{P(!0);try{const i=await fetch(`/api/meetings/${t.id}/protocol/data`);if(!i.ok)throw new Error("Failed to fetch protocol data");const $=await i.json();await kr({meeting:{...$.meeting,buildingAddress:t.buildingAddress||$.meeting.building_address},agendaItems:$.agendaItems,voteRecords:$.voteRecords,votesByItem:$.votesByItem,protocolHash:$.protocolHash})}catch{alert(e==="ru"?"Ошибка при скачивании протокола":"Bayonnomani yuklashda xato")}finally{P(!1)}};return r.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4",children:r.jsxs("div",{className:"bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto",children:[r.jsxs("div",{className:"p-6 border-b border-gray-100 flex items-center justify-between",children:[r.jsxs("div",{children:[r.jsx("h2",{className:"text-xl font-bold",children:e==="ru"?`Собрание #${t.number}`:`Yig'ilish #${t.number}`}),r.jsx("p",{className:"text-sm text-gray-500",children:t.buildingAddress})]}),r.jsxs("div",{className:"flex items-center gap-2",children:[["protocol_generated","protocol_approved"].includes(t.status)&&r.jsxs("button",{onClick:B,disabled:f,className:"flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition-colors disabled:opacity-50",children:[r.jsx(er,{className:"w-4 h-4"}),f?e==="ru"?"Загрузка...":"Yuklanmoqda...":e==="ru"?"Скачать протокол":"Bayonnomani yuklab olish"]}),r.jsx("button",{onClick:s,className:"p-2 hover:bg-gray-100 rounded-xl transition-colors",children:r.jsx(U,{className:"w-5 h-5"})})]})]}),r.jsxs("div",{className:"p-6 space-y-6",children:[r.jsxs("div",{className:"flex items-center gap-4 flex-wrap",children:[r.jsx("span",{className:`px-3 py-1 rounded-lg text-sm font-medium ${R[t.status]?.color==="green"?"bg-green-100 text-green-700":R[t.status]?.color==="blue"?"bg-blue-100 text-blue-700":R[t.status]?.color==="yellow"?"bg-yellow-100 text-orange-700":"bg-gray-100 text-gray-700"}`,children:e==="ru"?R[t.status]?.label:R[t.status]?.labelUz}),t.status!=="draft"&&t.status!=="pending_moderation"&&r.jsxs("div",{className:"flex items-center gap-2",children:[r.jsx(K,{className:"w-4 h-4 text-gray-400"}),r.jsxs("span",{className:"text-sm",children:[n.participated,"/",n.total," (",n.percent.toFixed(1),"%)"]}),r.jsx("span",{className:`text-xs px-2 py-0.5 rounded-full font-medium ${n.quorumReached?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`,children:n.quorumReached?e==="ru"?"Кворум":"Kvorum":e==="ru"?"Нет кворума":"Kvorum yo'q"})]})]}),t.confirmedDateTime&&r.jsxs("div",{className:"flex items-center gap-2 text-gray-600",children:[r.jsx(L,{className:"w-5 h-5"}),r.jsx("span",{children:new Date(t.confirmedDateTime).toLocaleDateString(e==="ru"?"ru-RU":"uz-UZ",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})})]}),t.status==="voting_open"&&r.jsxs("div",{className:"flex gap-2 border-b border-gray-200",children:[r.jsx("button",{onClick:()=>I("agenda"),className:`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${u==="agenda"?"border-primary-500 text-primary-600":"border-transparent text-gray-500 hover:text-gray-700"}`,children:e==="ru"?"Повестка дня":"Kun tartibi"}),r.jsxs("button",{onClick:()=>I("against"),className:`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${u==="against"?"border-primary-500 text-primary-600":"border-transparent text-gray-500 hover:text-gray-700"}`,children:[r.jsx(Y,{className:"w-4 h-4"}),e==="ru"?"Голоса против":"Qarshi ovozlar"]})]}),u==="against"&&t.status==="voting_open"&&r.jsxs("div",{className:"space-y-4",children:[z&&z.total>0&&r.jsxs("div",{className:"p-3 bg-blue-50 rounded-xl",children:[r.jsx("div",{className:"text-sm font-medium text-blue-800 mb-2",children:e==="ru"?"Статистика запросов на пересмотр":"Qayta ko'rib chiqish so'rovlari statistikasi"}),r.jsxs("div",{className:"grid grid-cols-3 gap-2 text-xs",children:[r.jsxs("div",{children:[r.jsx("span",{className:"text-blue-600",children:e==="ru"?"Отправлено:":"Yuborildi:"})," ",z.total]}),r.jsxs("div",{children:[r.jsx("span",{className:"text-green-600",children:e==="ru"?"Изменили:":"O'zgartirildi:"})," ",z.voteChanged]}),r.jsxs("div",{children:[r.jsx("span",{className:"text-gray-600",children:e==="ru"?"Конверсия:":"Konversiya:"})," ",z.conversionRate,"%"]})]})]}),r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:e==="ru"?"Выберите вопрос:":"Savolni tanlang:"}),r.jsx("select",{value:b||"",onChange:i=>v(i.target.value),className:"w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent",children:t.agendaItems.map((i,$)=>r.jsxs("option",{value:i.id,children:[$+1,". ",i.title]},i.id))})]}),g?r.jsx("div",{className:"text-center py-8 text-gray-500",children:e==="ru"?"Загрузка...":"Yuklanmoqda..."}):N.length===0?r.jsx("div",{className:"text-center py-8 text-gray-500",children:e==="ru"?"Нет голосов против по этому вопросу":"Bu savol bo'yicha qarshi ovozlar yo'q"}):r.jsx("div",{className:"space-y-3",children:N.map(i=>r.jsx("div",{className:"p-4 bg-gray-50 rounded-xl border border-gray-200",children:r.jsxs("div",{className:"flex items-start justify-between gap-4",children:[r.jsxs("div",{className:"flex-1",children:[r.jsx("div",{className:"font-medium",children:i.voterName}),r.jsxs("div",{className:"text-sm text-gray-500 flex items-center gap-4",children:[r.jsxs("span",{children:[e==="ru"?"Кв.":"Kv."," ",i.apartmentNumber]}),r.jsxs("span",{children:[i.voteWeight," ",e==="ru"?"кв.м":"kv.m"]}),i.phone&&r.jsxs("span",{className:"flex items-center gap-1",children:[r.jsx(pr,{className:"w-3 h-3"}),i.phone]})]}),i.comment&&r.jsxs("div",{className:"mt-2 p-2 bg-white rounded-lg text-sm text-gray-600",children:[r.jsx(mr,{className:"w-3 h-3 inline mr-1"}),i.comment]}),i.requestCount>0&&r.jsx("div",{className:"mt-2 text-xs text-orange-600",children:e==="ru"?`Отправлено запросов: ${i.requestCount}/2`:`Yuborilgan so'rovlar: ${i.requestCount}/2`})]}),r.jsxs("button",{onClick:()=>a({voterId:i.voterId,voterName:i.voterName}),disabled:!i.canSendRequest||m===i.voterId,className:`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${i.canSendRequest?"bg-primary-500 text-white hover:bg-primary-600":"bg-gray-200 text-gray-400 cursor-not-allowed"}`,children:[r.jsx(V,{className:"w-4 h-4"}),e==="ru"?"Запросить":"So'rash"]})]})},i.voteId))})]}),(u==="agenda"||t.status!=="voting_open")&&r.jsxs("div",{children:[r.jsx("h3",{className:"font-medium mb-3",children:e==="ru"?"Повестка дня":"Kun tartibi"}),r.jsx("div",{className:"space-y-4",children:t.agendaItems.map((i,$)=>{const l=p(t.id,i.id);return r.jsx("div",{className:"p-4 rounded-xl bg-gray-50 border border-gray-200",children:r.jsxs("div",{className:"flex items-start justify-between gap-4",children:[r.jsxs("div",{className:"flex-1",children:[r.jsxs("div",{className:"font-medium",children:[$+1,". ",i.title]}),r.jsx("p",{className:"text-sm text-gray-500 mt-1",children:i.description}),["voting_open","voting_closed","results_published","protocol_generated","protocol_approved"].includes(t.status)&&r.jsxs("div",{className:"mt-3 pt-3 border-t border-gray-200",children:[r.jsxs("div",{className:"grid grid-cols-3 gap-2 text-sm",children:[r.jsxs("div",{className:"flex items-center gap-1",children:[r.jsx(xr,{className:"w-4 h-4 text-green-500"}),r.jsxs("span",{children:[l.votesFor," (",l.percentFor.toFixed(0),"%)"]})]}),r.jsxs("div",{className:"flex items-center gap-1",children:[r.jsx(Y,{className:"w-4 h-4 text-red-500"}),r.jsx("span",{children:l.votesAgainst})]}),r.jsxs("div",{className:"flex items-center gap-1",children:[r.jsx(hr,{className:"w-4 h-4 text-gray-400"}),r.jsx("span",{children:l.votesAbstain})]})]}),r.jsx("div",{className:"mt-2 h-2 bg-gray-200 rounded-full overflow-hidden",children:r.jsx("div",{className:`h-full ${l.thresholdMet?"bg-green-500":"bg-red-500"}`,style:{width:`${l.percentFor}%`}})}),r.jsxs("div",{className:"flex items-center justify-between mt-1 text-xs text-gray-500",children:[r.jsx("span",{children:"0%"}),r.jsxs("span",{children:[e==="ru"?"Порог:":"Chegara:"," ",A[i.threshold].percent,"%"]}),r.jsx("span",{children:"100%"})]})]})]}),i.isApproved!==void 0&&r.jsx("span",{className:`px-2 py-1 rounded-lg text-xs font-medium ${i.isApproved?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`,children:i.isApproved?e==="ru"?"Принято":"Qabul":e==="ru"?"Не принято":"Rad"})]})},i.id)})})]})]}),y&&r.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4",children:r.jsxs("div",{className:"bg-white rounded-2xl w-full max-w-md p-6",children:[r.jsx("h3",{className:"text-lg font-bold mb-4",children:e==="ru"?"Запрос на пересмотр голоса":"Ovozni qayta ko'rib chiqish so'rovi"}),r.jsxs("div",{className:"mb-4 p-3 bg-gray-50 rounded-xl",children:[r.jsx("div",{className:"text-sm text-gray-500",children:e==="ru"?"Получатель:":"Qabul qiluvchi:"}),r.jsx("div",{className:"font-medium",children:y.voterName})]}),r.jsxs("div",{className:"mb-4",children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:e==="ru"?"Причина запроса:":"So'rov sababi:"}),r.jsxs("select",{value:o,onChange:i=>d(i.target.value),className:"w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent",children:[r.jsx("option",{value:"",children:e==="ru"?"Выберите причину...":"Sababni tanlang..."}),W.map(i=>r.jsx("option",{value:i.value,children:i.label},i.value))]})]}),r.jsxs("div",{className:"mb-4",children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:e==="ru"?"Сообщение (необязательно):":"Xabar (ixtiyoriy):"}),r.jsx("textarea",{value:x,onChange:i=>j(i.target.value),placeholder:e==="ru"?"Личное сообщение жителю...":"Aholiga shaxsiy xabar...",className:"w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none",rows:3,maxLength:500}),r.jsxs("div",{className:"text-xs text-gray-400 text-right mt-1",children:[x.length,"/500"]})]}),r.jsxs("div",{className:"p-3 bg-yellow-50 rounded-xl mb-4 text-sm text-yellow-800",children:[r.jsx(tr,{className:"w-4 h-4 inline mr-1"}),e==="ru"?"Это только просьба. Житель сам решает, менять голос или нет.":"Bu faqat iltimos. Aholi ovozni o'zgartirish yoki o'zgartirmaslikni o'zi hal qiladi."]}),r.jsxs("div",{className:"flex gap-3",children:[r.jsx("button",{onClick:()=>{a(null),d(""),j("")},className:"flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors",children:e==="ru"?"Отмена":"Bekor qilish"}),r.jsxs("button",{onClick:O,disabled:!o||!!m,className:"flex-1 px-4 py-2 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2",children:[r.jsx(V,{className:"w-4 h-4"}),m?e==="ru"?"Отправка...":"Yuborilmoqda...":e==="ru"?"Отправить":"Yuborish"]})]})]})})]})})}export{Fr as MeetingsPage};
//# sourceMappingURL=MeetingsPage-1772030750130-DrNskfE6.js.map
