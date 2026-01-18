import{r as j,j as r,au as L,h as q,B as K,ac as R,U as Q,F as W,a0 as er,a1 as Y,X as S,a9 as tr,aN as sr,af as wr,aO as ar,g as lr,o as or,ab as U,N as nr,aP as ir,aQ as cr,ax as dr}from"./react-vendor-1768735693672-CIWGlI3X.js";import{b as pr,d as mr,h as xr,i as hr,M as D,A as C,D as k}from"./index-1768735693672-2PgixYDA.js";import{P as ur,Q as V}from"./vendor-1768735693672-B3Qk4aGE.js";import"./zustand-1768735693672-wNUYBKDB.js";import"./qr-scanner-1768735693672-cr32YHjo.js";const I={name:"OOO KAMIZO",address:"г. Ташкент, Яшнобадский район, ул. Махтумкули, дом 93/3",bank:"«Ориент Финанс» ЧАКБ Миробад филиал",account:"20208000805307918001",inn:"307928888",oked:"81100",mfo:"01071"};function Pr(t,s){const e=URL.createObjectURL(t),c=/iPad|iPhone|iPod/.test(navigator.userAgent),n=/^((?!chrome|android).)*safari/i.test(navigator.userAgent);if(c||n)window.open(e,"_blank")||(window.location.href=e),setTimeout(()=>URL.revokeObjectURL(e),1e4);else{const l=document.createElement("a");l.href=e,l.download=s,l.style.display="none",document.body.appendChild(l),l.click(),document.body.removeChild(l),setTimeout(()=>URL.revokeObjectURL(e),100)}}const br={0:"января",1:"февраля",2:"марта",3:"апреля",4:"мая",5:"июня",6:"июля",7:"августа",8:"сентября",9:"октября",10:"ноября",11:"декабря"};function vr(t){if(!t)return"___";const s=new Date(t);return`${s.getDate()} ${br[s.getMonth()]} ${s.getFullYear()}`}function gr(t){if(!t)return"___";const s=new Date(t);return`${s.getHours().toString().padStart(2,"0")}:${s.getMinutes().toString().padStart(2,"0")}`}function E(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}function fr(t,s){const e=t.votes_for_area+t.votes_against_area+t.votes_abstain_area;return{votesFor:t.votes_for_area,votesAgainst:t.votes_against_area,votesAbstain:t.votes_abstain_area,percentFor:e>0?t.votes_for_area/e*100:0,percentAgainst:e>0?t.votes_against_area/e*100:0,percentAbstain:e>0?t.votes_abstain_area/e*100:0}}function B(t){const s=t.split(",")[1],e=atob(s),c=new Uint8Array(e.length);for(let n=0;n<e.length;n++)c[n]=e.charCodeAt(n);return c}async function yr(){const t=[`Компания: ${I.name}`,`Адрес: ${I.address}`,`Банк: ${I.bank}`,`Р/С: ${I.account}`,`ИНН: ${I.inn}`,`ОКЭД: ${I.oked}`,`МФО: ${I.mfo}`].join(`
`);return await V.toDataURL(t,{width:150,margin:1,color:{dark:"#1f2937",light:"#ffffff"}})}async function jr(t,s,e){const c=["ЭЛЕКТРОННАЯ ПОДПИСЬ",`Протокол: ${s}`,`ФИО: ${t.voter_name}`,`Квартира: ${t.apartment_number||"-"}`,`Площадь: ${t.vote_weight?.toFixed(2)||"-"} кв.м`,`Голос: ${t.choice==="for"?"ЗА":t.choice==="against"?"ПРОТИВ":"ВОЗДЕРЖАЛСЯ"}`,`Дата: ${new Date(t.voted_at).toLocaleString("ru-RU")}`,`Адрес: ${e}`].join(`
`);return await V.toDataURL(c,{width:80,margin:1,color:{dark:"#1f2937",light:"#ffffff"}})}function O(t){return`
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
</w:tbl>`}function Nr(t,s){let e=`
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
  </w:tr>`;return t.forEach((c,n)=>{const l=new Date(c.voted_at),b=c.choice==="for"?"ЗА":c.choice==="against"?"ПРОТИВ":"ВОЗДЕРЖ.",u=s.get(c.voter_id),f=u?`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="600000" cy="600000"/><wp:docPr id="${1e3+n}" name="QR Signature ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="voter_qr_${n}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${u}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="600000" cy="600000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`:"<w:r><w:t>✓</w:t></w:r>";e+=`
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${n+1}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/></w:tcPr>
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
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${l.toLocaleDateString("ru-RU")}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${b}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/></w:pPr>${f}</w:p>
    </w:tc>
  </w:tr>`}),e+="</w:tbl>",e}function zr(t,s){if(!s||s.length===0)return"";const e=s.some(n=>n.comment&&n.comment.trim().length>0);let c=`
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
  </w:tr>`;return s.forEach((n,l)=>{const b=n.choice==="for"?"ЗА":n.choice==="against"?"ПРОТИВ":"ВОЗДЕРЖАЛСЯ",u=n.comment?.trim()||"";c+=`
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="500" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${l+1}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="${e?"2500":"3500"}" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${E(n.voter_name)}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${n.apartment_number||"-"}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${n.vote_weight?.toFixed(2)||"-"}</w:t></w:r></w:p>
    </w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${b}</w:t></w:r></w:p>
    </w:tc>
    ${e?`<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:rPr><w:sz w:val="14"/><w:i/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="14"/><w:i/></w:rPr><w:t>${E(u)}</w:t></w:r></w:p>
    </w:tc>`:""}
  </w:tr>`}),c+="</w:tbl>",c}async function _r(t){const{meeting:s,agendaItems:e,voteRecords:c,votesByItem:n}=t,l=s.buildingAddress||s.building_address||"Адрес не указан",b=vr(s.confirmed_date_time||s.voting_opened_at),u=gr(s.confirmed_date_time||s.voting_opened_at),f=s.location||l,h=s.format==="online"?"заочной":s.format==="hybrid"?"очно-заочной":"очной",P=await yr(),p=new Map,y=new Map;for(let d=0;d<c.length;d++){const x=c[d],g=await jr(x,s.number,l);p.set(x.voter_id,g),y.set(x.voter_id,`rId${200+d}`)}let a="";a+=`
<w:p><w:pPr><w:spacing w:before="200" w:after="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>1. Избрание Председателя и Секретаря собрания</w:t></w:r></w:p>
<w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>СЛУШАЛИ: Предложение об избрании Председателя и Секретаря собрания из числа присутствующих собственников помещений.</w:t></w:r></w:p>
<w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>ПРЕДЛОЖЕНО: Избрать Председателем собрания представителя УК, Секретарём - ${s.organizer_name||"представителя УК"}.</w:t></w:r></w:p>
<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>ГОЛОСОВАЛИ:</w:t></w:r></w:p>
${O({votesFor:s.voted_area,votesAgainst:0,votesAbstain:0,percentFor:100,percentAgainst:0,percentAbstain:0})}
<w:p><w:pPr><w:spacing w:before="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>РЕШЕНИЕ: Избрать Председателя и Секретаря собрания. Решение принято.</w:t></w:r></w:p>
`,e.forEach((d,x)=>{const g=fr(d,s.total_area),$=x+2,_=g.percentFor>50,A=n[d.id]||[];a+=`
<w:p><w:pPr><w:spacing w:before="300" w:after="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>${$}. ${E(d.title)}</w:t></w:r></w:p>
${d.description?`<w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>СЛУШАЛИ: ${E(d.description)}</w:t></w:r></w:p>`:""}
<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>ГОЛОСОВАЛИ:</w:t></w:r></w:p>
${O(g)}
${zr(d,A)}
<w:p><w:pPr><w:spacing w:before="100"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>РЕШЕНИЕ: ${_?"Решение принято.":"Решение не принято."}</w:t></w:r></w:p>
`});const T=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
    <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>${E(l)}</w:t></w:r></w:p>

    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>проведённого в форме ${h} голосования</w:t></w:r></w:p>

    <!-- Meeting Info -->
    <w:p><w:pPr><w:spacing w:before="200"/><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Дата проведения: </w:t></w:r>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${b}</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Время: </w:t></w:r>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${u}</w:t></w:r></w:p>

    <w:p><w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Место проведения: </w:t></w:r>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${E(f)}</w:t></w:r></w:p>

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
    ${a}

    <!-- UK QR Code Signature -->
    <w:p><w:pPr><w:spacing w:before="400"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="900000" cy="900000"/><wp:docPr id="999" name="UK QR Code"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="uk_qr.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId100" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="900000" cy="900000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>Управляющая компания</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="18"/></w:rPr></w:pPr>
    <w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${I.name}</w:t></w:r></w:p>

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

    ${Nr(c,y)}

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
</w:document>`,m=new ur,N=B(P);m.file("word/media/uk_qr.png",N);for(const[d,x]of p){const g=B(x),$=c.findIndex(_=>_.voter_id===d);m.file(`word/media/voter_qr_${$}.png`,g)}let z=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId100" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/uk_qr.png"/>`;for(let d=0;d<c.length;d++)z+=`
  <Relationship Id="rId${200+d}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/voter_qr_${d}.png"/>`;z+=`
</Relationships>`,m.file("[Content_Types].xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`),m.file("_rels/.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`),m.file("word/_rels/document.xml.rels",z),m.file("word/document.xml",T);const w=m.generate({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}),i=`Протокол_${s.number}_${l.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g,"_")}.docx`;Pr(w,i)}function Fr(){const{user:t}=pr(),{t:s,language:e}=mr(),{buildings:c,fetchBuildings:n}=xr(),{meetings:l,fetchMeetings:b,createMeeting:u,approveMeeting:f,rejectMeeting:h,confirmSchedule:P,openVoting:p,closeVoting:y,publishResults:a,generateProtocol:v,approveProtocol:T,deleteMeeting:m,calculateAgendaItemResult:N,calculateMeetingQuorum:z}=hr();j.useEffect(()=>{b(),n()},[b,n]);const[w,i]=j.useState("all"),[d,x]=j.useState(!1),[g,$]=j.useState(null),[_,A]=j.useState(!1),M=j.useMemo(()=>{switch(w){case"active":return l.filter(o=>["schedule_poll_open","schedule_confirmed","voting_open"].includes(o.status));case"completed":return l.filter(o=>["voting_closed","results_published","protocol_generated","protocol_approved"].includes(o.status));case"pending":return l.filter(o=>["draft","pending_moderation"].includes(o.status));default:return l}},[l,w]),G=o=>D[o]?.color||"gray",H=o=>{const F=D[o];return e==="ru"?F?.label:F?.labelUz},X=o=>new Date(o).toLocaleDateString(e==="ru"?"ru-RU":"uz-UZ",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}),Z=o=>{$(o),A(!0)},J=async o=>{confirm(e==="ru"?"Удалить собрание? Это действие необратимо.":"Yig'ilishni o'chirmoqchimisiz? Bu amalni bekor qilib bo'lmaydi.")&&await m(o)},rr=[{id:"all",label:e==="ru"?"Все":"Barchasi",count:l.length},{id:"active",label:e==="ru"?"Активные":"Faol",count:l.filter(o=>["schedule_poll_open","schedule_confirmed","voting_open"].includes(o.status)).length},{id:"pending",label:e==="ru"?"Ожидают":"Kutmoqda",count:l.filter(o=>["draft","pending_moderation"].includes(o.status)).length},{id:"completed",label:e==="ru"?"Завершены":"Tugallangan",count:l.filter(o=>["voting_closed","results_published","protocol_generated","protocol_approved"].includes(o.status)).length}];return r.jsxs("div",{className:"space-y-6",children:[r.jsxs("div",{className:"flex items-center justify-between",children:[r.jsxs("div",{children:[r.jsx("h1",{className:"text-2xl font-bold text-gray-900",children:s("meetings.title")}),r.jsx("p",{className:"text-gray-500",children:s("meetings.subtitle")})]}),r.jsxs("button",{onClick:()=>x(!0),className:"btn-primary flex items-center gap-2",children:[r.jsx(L,{className:"w-5 h-5"}),s("meetings.create")]})]}),r.jsx("div",{className:"flex gap-2 flex-wrap",children:rr.map(o=>r.jsxs("button",{onClick:()=>i(o.id),className:`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${w===o.id?"bg-orange-400 text-gray-900":"bg-white text-gray-600 hover:bg-gray-100"}`,children:[o.label,o.count>0&&r.jsx("span",{className:"ml-1 px-2 py-0.5 rounded-full bg-gray-900/10 text-xs",children:o.count})]},o.id))}),r.jsx("div",{className:"space-y-4",children:M.length===0?r.jsxs("div",{className:"glass-card p-12 text-center",children:[r.jsx(q,{className:"w-16 h-16 mx-auto text-gray-300 mb-4"}),r.jsx("h3",{className:"text-lg font-medium text-gray-600 mb-2",children:s("meetings.noMeetings")}),r.jsx("p",{className:"text-gray-400",children:s("meetings.createFirst")})]}):M.map(o=>r.jsx($r,{meeting:o,language:e,getStatusColor:G,getStatusLabel:H,formatDate:X,onViewDetails:()=>Z(o),onApprove:()=>f(o.id),onReject:F=>h(o.id,F),onConfirmSchedule:()=>P(o.id),onOpenVoting:()=>p(o.id),onCloseVoting:()=>y(o.id),onPublishResults:()=>a(o.id),onGenerateProtocol:()=>v(o.id),onApproveProtocol:()=>T(o.id),onDelete:()=>J(o.id),calculateQuorum:()=>z(o.id),user:t},o.id))}),d&&r.jsx(Cr,{onClose:()=>x(!1),onCreate:async o=>{try{await u(o),await b(),x(!1)}catch{}},language:e,user:t,buildings:c.map(o=>({id:o.id,name:o.name,address:o.address}))}),_&&g&&r.jsx(kr,{meeting:g,onClose:()=>{A(!1),$(null)},language:e,calculateResult:N,calculateQuorum:()=>z(g.id)})]})}function $r({meeting:t,language:s,getStatusColor:e,getStatusLabel:c,formatDate:n,onViewDetails:l,onApprove:b,onReject:u,onConfirmSchedule:f,onOpenVoting:h,onCloseVoting:P,onPublishResults:p,onGenerateProtocol:y,onApproveProtocol:a,onDelete:v,calculateQuorum:T,user:m}){const N=T(),z=e(t.status),w={gray:"bg-gray-100 text-gray-700",yellow:"bg-yellow-100 text-orange-700",blue:"bg-blue-100 text-blue-700",indigo:"bg-indigo-100 text-indigo-700",green:"bg-green-100 text-green-700",orange:"bg-orange-100 text-orange-700",purple:"bg-purple-100 text-purple-700",teal:"bg-teal-100 text-teal-700",emerald:"bg-emerald-100 text-emerald-700",red:"bg-red-100 text-red-700"};return r.jsxs("div",{className:"glass-card p-5 hover:shadow-lg transition-shadow",children:[r.jsxs("div",{className:"flex items-start justify-between gap-4",children:[r.jsxs("div",{className:"flex-1 min-w-0",children:[r.jsxs("div",{className:"flex items-center gap-3 mb-3 flex-wrap",children:[r.jsx("span",{className:`px-3 py-1 rounded-lg text-sm font-medium ${w[z]||w.gray}`,children:c(t.status)}),r.jsxs("span",{className:"text-sm text-gray-500",children:["#",t.number]}),r.jsx("span",{className:`px-2 py-0.5 rounded text-xs font-medium ${t.format==="online"?"bg-blue-50 text-blue-600":t.format==="offline"?"bg-green-50 text-green-600":"bg-purple-50 text-purple-600"}`,children:t.format==="online"?s==="ru"?"Онлайн":"Onlayn":t.format==="offline"?s==="ru"?"Очное":"Yuzma-yuz":s==="ru"?"Смешанное":"Aralash"})]}),r.jsxs("div",{className:"flex items-center gap-4 text-sm text-gray-600 mb-2",children:[r.jsxs("span",{className:"flex items-center gap-1",children:[r.jsx(K,{className:"w-4 h-4"}),t.buildingAddress]}),t.confirmedDateTime&&r.jsxs("span",{className:"flex items-center gap-1",children:[r.jsx(R,{className:"w-4 h-4"}),n(t.confirmedDateTime)]})]}),r.jsxs("div",{className:"flex items-center gap-2 text-sm text-gray-500 mb-3",children:[r.jsx(Q,{className:"w-4 h-4"}),r.jsx("span",{children:t.organizerName}),r.jsxs("span",{className:"text-gray-400",children:["(",t.organizerType==="resident"?s==="ru"?"Житель":"Aholi":s==="ru"?"УК":"UK",")"]})]}),r.jsxs("div",{className:"flex items-center gap-2 text-sm",children:[r.jsx(W,{className:"w-4 h-4 text-gray-400"}),r.jsxs("span",{className:"text-gray-600",children:[t.agendaItems.length," ",s==="ru"?"вопросов в повестке":"savol kun tartibida"]})]}),t.status==="schedule_poll_open"&&t.scheduleOptions&&t.scheduleOptions.length>0&&r.jsxs("div",{className:"mt-3 pt-3 border-t border-gray-100",children:[r.jsxs("div",{className:"text-sm font-medium text-gray-700 mb-2 flex items-center gap-2",children:[r.jsx(R,{className:"w-4 h-4 text-blue-500"}),s==="ru"?"Голосование за дату:":"Sana uchun ovoz berish:"]}),r.jsx("div",{className:"space-y-1",children:t.scheduleOptions.map(i=>{const d=t.scheduleOptions.reduce((_,A)=>_+(A.voteCount??A.votes?.length??0),0),x=i.voteCount??i.votes?.length??0,g=d>0?x/d*100:0,$=x>0&&x===Math.max(...t.scheduleOptions.map(_=>_.voteCount??_.votes?.length??0));return r.jsxs("div",{className:"flex items-center gap-2 text-sm",children:[r.jsxs("div",{className:`flex-1 flex items-center gap-2 ${$?"font-medium text-blue-700":"text-gray-600"}`,children:[r.jsx("span",{children:n(i.dateTime)}),$&&x>0&&r.jsx("span",{className:"text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded",children:s==="ru"?"Лидер":"Yetakchi"})]}),r.jsxs("div",{className:"flex items-center gap-2",children:[r.jsx("div",{className:"w-20 h-2 bg-gray-100 rounded-full overflow-hidden",children:r.jsx("div",{className:"h-full bg-blue-500 rounded-full transition-all",style:{width:`${g}%`}})}),r.jsxs("span",{className:"text-xs text-gray-500 w-12 text-right",children:[x," (",g.toFixed(0),"%)"]})]})]},i.id)})}),r.jsxs("div",{className:"text-xs text-gray-400 mt-2",children:[s==="ru"?"Всего голосов: ":"Jami ovozlar: ",t.scheduleOptions.reduce((i,d)=>i+(d.voteCount??d.votes?.length??0),0)]})]}),["voting_open","voting_closed","results_published","protocol_generated","protocol_approved"].includes(t.status)&&r.jsxs("div",{className:"flex items-center gap-4 mt-3 pt-3 border-t border-gray-100",children:[r.jsxs("div",{className:"flex items-center gap-2",children:[r.jsx(q,{className:"w-4 h-4 text-gray-400"}),r.jsxs("span",{className:"text-sm",children:[N.participated,"/",N.total," (",N.percent.toFixed(1),"%)"]})]}),r.jsx("span",{className:`text-xs px-2 py-0.5 rounded-full font-medium ${N.quorumReached?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`,children:N.quorumReached?s==="ru"?"Кворум есть":"Kvorum bor":s==="ru"?"Нет кворума":"Kvorum yo'q"})]})]}),r.jsxs("div",{className:"flex flex-col gap-2",children:[r.jsx("button",{onClick:l,className:"p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors",title:s==="ru"?"Подробнее":"Batafsil",children:r.jsx(er,{className:"w-5 h-5"})}),t.status==="pending_moderation"&&(m?.role==="admin"||m?.role==="manager"||m?.role==="director")&&r.jsxs(r.Fragment,{children:[r.jsx("button",{onClick:b,className:"p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors",title:s==="ru"?"Одобрить":"Tasdiqlash",children:r.jsx(Y,{className:"w-5 h-5"})}),r.jsx("button",{onClick:()=>u(s==="ru"?"Отклонено модератором":"Moderator tomonidan rad etildi"),className:"p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors",title:s==="ru"?"Отклонить":"Rad etish",children:r.jsx(S,{className:"w-5 h-5"})})]}),(m?.role==="admin"||m?.role==="manager"||m?.role==="director")&&r.jsx("button",{onClick:v,className:"p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors",title:s==="ru"?"Удалить":"O'chirish",children:r.jsx(tr,{className:"w-5 h-5"})})]})]}),(m?.role==="admin"||m?.role==="manager"||m?.role==="director")&&r.jsxs("div",{className:"mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2",children:[t.status==="schedule_poll_open"&&r.jsxs("button",{onClick:f,className:"flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium",children:[r.jsx(sr,{className:"w-4 h-4"}),s==="ru"?"Подтвердить дату":"Sanani tasdiqlash"]}),t.status==="schedule_confirmed"&&r.jsxs("button",{onClick:h,className:"flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm font-medium",children:[r.jsx(wr,{className:"w-4 h-4"}),s==="ru"?"Открыть голосование":"Ovoz berishni ochish"]}),t.status==="voting_open"&&r.jsxs("button",{onClick:P,className:"flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors text-sm font-medium",children:[r.jsx(ar,{className:"w-4 h-4"}),s==="ru"?"Закрыть голосование":"Ovoz berishni yopish"]}),t.status==="voting_closed"&&r.jsxs("button",{onClick:p,className:"flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors text-sm font-medium",children:[r.jsx(lr,{className:"w-4 h-4"}),s==="ru"?"Опубликовать итоги":"Natijalarni e'lon qilish"]}),t.status==="results_published"&&r.jsxs("button",{onClick:y,className:"flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-colors text-sm font-medium",children:[r.jsx(W,{className:"w-4 h-4"}),s==="ru"?"Сформировать протокол":"Bayonnoma yaratish"]}),t.status==="protocol_generated"&&r.jsxs(r.Fragment,{children:[r.jsxs("button",{onClick:a,className:"flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors text-sm font-medium",children:[r.jsx(or,{className:"w-4 h-4"}),s==="ru"?"Подписать протокол":"Bayonnomani imzolash"]}),r.jsxs("button",{onClick:l,className:"flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium",children:[r.jsx(U,{className:"w-4 h-4"}),s==="ru"?"Скачать протокол":"Bayonnomani yuklab olish"]})]}),t.status==="protocol_approved"&&r.jsxs("button",{onClick:l,className:"flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium",children:[r.jsx(U,{className:"w-4 h-4"}),s==="ru"?"Скачать протокол":"Bayonnomani yuklab olish"]})]})]})}function Cr({onClose:t,onCreate:s,language:e,user:c,buildings:n}){const[l,b]=j.useState(1),[u,f]=j.useState(!1),[h,P]=j.useState(!1),[p,y]=j.useState({title:"",description:"",threshold:"simple_majority"}),[a,v]=j.useState({buildingId:c?.buildingId||(n.length>0?n[0].id:""),buildingAddress:n.length>0?n[0].address:"",organizerType:"management",format:"online",agendaItems:[],customItems:[],location:"",description:""}),T=w=>{const i=n.find(d=>d.id===w);v({...a,buildingId:w,buildingAddress:i?.address||""})},m=w=>{a.agendaItems.includes(w)?v({...a,agendaItems:a.agendaItems.filter(i=>i!==w)}):v({...a,agendaItems:[...a.agendaItems,w]})},N=async()=>{if(!c||!a.buildingId||u)return;f(!0);const w=[...a.agendaItems.map(i=>({type:i,title:e==="ru"?C[i].label:C[i].labelUz,description:e==="ru"?C[i].description:C[i].descriptionUz,threshold:C[i].defaultThreshold,materials:[]})),...a.customItems.map(i=>({type:"other",title:i.title,description:i.description,threshold:i.threshold,materials:[]}))];try{await s({buildingId:a.buildingId,buildingAddress:a.buildingAddress,organizerType:a.organizerType,organizerId:c.id,organizerName:c.name,format:a.format,agendaItems:w,location:a.location||void 0,description:a.description||void 0})}finally{f(!1)}},z=[{num:1,label:e==="ru"?"Тип":"Turi"},{num:2,label:e==="ru"?"Повестка":"Kun tartibi"},{num:3,label:e==="ru"?"Публикация":"Nashr"}];return r.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4",children:r.jsxs("div",{className:"bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto",children:[r.jsxs("div",{className:"p-6 border-b border-gray-100 flex items-center justify-between",children:[r.jsxs("div",{children:[r.jsx("h2",{className:"text-xl font-bold",children:e==="ru"?"Созвать собрание":"Yig'ilish chaqirish"}),r.jsx("p",{className:"text-sm text-gray-500",children:e==="ru"?`Шаг ${l} из 3`:`Bosqich ${l} dan 3`})]}),r.jsx("button",{onClick:t,className:"p-2 hover:bg-gray-100 rounded-xl transition-colors",children:r.jsx(S,{className:"w-5 h-5"})})]}),r.jsx("div",{className:"px-6 py-4 border-b border-gray-100",children:r.jsx("div",{className:"flex items-center justify-between",children:z.map((w,i)=>r.jsxs("div",{className:"flex items-center",children:[r.jsx("div",{className:`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${l>=w.num?"bg-orange-400 text-gray-900":"bg-gray-200 text-gray-500"}`,children:w.num}),r.jsx("span",{className:`ml-2 text-sm ${l>=w.num?"text-gray-900":"text-gray-500"}`,children:w.label}),i<z.length-1&&r.jsx("div",{className:`w-16 h-1 mx-4 rounded ${l>w.num?"bg-orange-400":"bg-gray-200"}`})]},w.num))})}),r.jsxs("div",{className:"p-6 space-y-6",children:[l===1&&r.jsxs(r.Fragment,{children:[r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-3",children:e==="ru"?"Выберите дом":"Uyni tanlang"}),n.length===0?r.jsx("div",{className:"p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800",children:e==="ru"?"Нет доступных домов. Сначала добавьте дом в системе.":"Mavjud uylar yo'q. Avval tizimda uy qo'shing."}):r.jsx("select",{value:a.buildingId,onChange:w=>T(w.target.value),className:"w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-400 focus:border-orange-400",children:n.map(w=>r.jsxs("option",{value:w.id,children:[w.name," - ",w.address]},w.id))})]}),r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-3",children:e==="ru"?"Организатор":"Tashkilotchi"}),r.jsxs("div",{className:"grid grid-cols-2 gap-3",children:[r.jsxs("button",{onClick:()=>v({...a,organizerType:"management"}),className:`p-4 rounded-xl border-2 transition-colors ${a.organizerType==="management"?"border-orange-400 bg-yellow-50":"border-gray-200 hover:border-gray-300"}`,children:[r.jsx(K,{className:"w-6 h-6 mb-2 mx-auto text-gray-600"}),r.jsx("div",{className:"text-sm font-medium",children:e==="ru"?"Управляющая компания":"Boshqaruv kompaniyasi"})]}),r.jsxs("button",{onClick:()=>v({...a,organizerType:"resident"}),className:`p-4 rounded-xl border-2 transition-colors ${a.organizerType==="resident"?"border-orange-400 bg-yellow-50":"border-gray-200 hover:border-gray-300"}`,children:[r.jsx(Q,{className:"w-6 h-6 mb-2 mx-auto text-gray-600"}),r.jsx("div",{className:"text-sm font-medium",children:e==="ru"?"Житель (инициатива)":"Aholi (tashabbusi)"})]})]})]}),r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-3",children:e==="ru"?"Формат проведения":"O'tkazish formati"}),r.jsx("div",{className:"grid grid-cols-3 gap-3",children:["online","offline","hybrid"].map(w=>r.jsx("button",{onClick:()=>v({...a,format:w}),className:`p-3 rounded-xl border-2 transition-colors ${a.format===w?"border-orange-400 bg-yellow-50":"border-gray-200 hover:border-gray-300"}`,children:r.jsx("div",{className:"text-sm font-medium",children:w==="online"?e==="ru"?"Онлайн":"Onlayn":w==="offline"?e==="ru"?"Очное":"Yuzma-yuz":e==="ru"?"Смешанное":"Aralash"})},w))})]}),a.format!=="online"&&r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:e==="ru"?"Место проведения":"O'tkazish joyi"}),r.jsx("input",{type:"text",value:a.location,onChange:w=>v({...a,location:w.target.value}),className:"glass-input",placeholder:e==="ru"?"Например: Холл 1 этажа":"Masalan: 1-qavat zali"})]}),r.jsxs("div",{children:[r.jsxs("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:[e==="ru"?"Обоснование собрания":"Yig'ilish asoslashi",r.jsxs("span",{className:"text-gray-400 font-normal ml-1",children:["(",e==="ru"?"необязательно":"ixtiyoriy",")"]})]}),r.jsx("textarea",{value:a.description,onChange:w=>v({...a,description:w.target.value}),className:"glass-input min-h-[80px] resize-none",placeholder:e==="ru"?"Опишите причину созыва собрания и что планируется обсудить...":"Yig'ilish sababi va nimalar muhokama qilinishini tasvirlang...",rows:3})]})]}),l===2&&r.jsxs(r.Fragment,{children:[r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-3",children:e==="ru"?"Выберите вопросы повестки":"Kun tartibi savollarini tanlang"}),r.jsx("div",{className:"space-y-2 max-h-96 overflow-y-auto",children:Object.keys(C).map(w=>{const i=C[w],d=a.agendaItems.includes(w);return r.jsx("button",{onClick:()=>m(w),className:`w-full p-4 rounded-xl border-2 text-left transition-colors ${d?"border-orange-400 bg-yellow-50":"border-gray-200 hover:border-gray-300"}`,children:r.jsxs("div",{className:"flex items-start justify-between",children:[r.jsxs("div",{children:[r.jsx("div",{className:"font-medium",children:e==="ru"?i.label:i.labelUz}),r.jsx("div",{className:"text-sm text-gray-500 mt-1",children:e==="ru"?i.description:i.descriptionUz}),r.jsxs("div",{className:"flex items-center gap-2 mt-2",children:[r.jsx("span",{className:"text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600",children:e==="ru"?k[i.defaultThreshold].label:k[i.defaultThreshold].labelUz}),i.requiresMaterials&&r.jsx("span",{className:"text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-600",children:e==="ru"?"Нужны материалы":"Materiallar kerak"})]})]}),r.jsx("div",{className:`w-6 h-6 rounded-full border-2 flex items-center justify-center ${d?"border-orange-400 bg-orange-400":"border-gray-300"}`,children:d&&r.jsx(Y,{className:"w-4 h-4 text-gray-900"})})]})},w)})})]}),r.jsxs("div",{className:"mt-6 pt-6 border-t border-gray-200",children:[r.jsxs("div",{className:"flex items-center justify-between mb-3",children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700",children:e==="ru"?"Свои вопросы":"O'z savollaringiz"}),r.jsxs("button",{type:"button",onClick:()=>P(!0),className:"text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1",children:[r.jsx(L,{className:"w-4 h-4"}),e==="ru"?"Добавить вопрос":"Savol qo'shish"]})]}),a.customItems.length>0&&r.jsx("div",{className:"space-y-2 mb-4",children:a.customItems.map((w,i)=>r.jsx("div",{className:"p-3 rounded-xl border-2 border-orange-400 bg-yellow-50",children:r.jsxs("div",{className:"flex items-start justify-between",children:[r.jsxs("div",{className:"flex-1",children:[r.jsx("div",{className:"font-medium",children:w.title}),w.description&&r.jsx("div",{className:"text-sm text-gray-500 mt-1",children:w.description}),r.jsx("span",{className:"text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 mt-2 inline-block",children:e==="ru"?k[w.threshold].label:k[w.threshold].labelUz})]}),r.jsx("button",{onClick:()=>v({...a,customItems:a.customItems.filter((d,x)=>x!==i)}),className:"p-1 text-red-500 hover:bg-red-50 rounded",children:r.jsx(S,{className:"w-4 h-4"})})]})},i))}),h&&r.jsxs("div",{className:"p-4 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 space-y-3",children:[r.jsx("input",{type:"text",value:p.title,onChange:w=>y({...p,title:w.target.value}),className:"glass-input",placeholder:e==="ru"?"Название вопроса *":"Savol nomi *"}),r.jsx("textarea",{value:p.description,onChange:w=>y({...p,description:w.target.value}),className:"glass-input min-h-[60px] resize-none",placeholder:e==="ru"?"Описание (необязательно)":"Tavsif (ixtiyoriy)",rows:2}),r.jsxs("div",{children:[r.jsx("label",{className:"block text-xs text-gray-500 mb-1",children:e==="ru"?"Порог принятия":"Qabul qilish chegarasi"}),r.jsx("select",{value:p.threshold,onChange:w=>y({...p,threshold:w.target.value}),className:"glass-input text-sm",children:Object.keys(k).map(w=>r.jsx("option",{value:w,children:e==="ru"?k[w].label:k[w].labelUz},w))})]}),r.jsxs("div",{className:"flex gap-2",children:[r.jsx("button",{type:"button",onClick:()=>{p.title.trim()&&(v({...a,customItems:[...a.customItems,{...p}]}),y({title:"",description:"",threshold:"simple_majority"}),P(!1))},disabled:!p.title.trim(),className:"flex-1 py-2 px-4 bg-orange-400 hover:bg-orange-500 text-gray-900 rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed",children:e==="ru"?"Добавить":"Qo'shish"}),r.jsx("button",{type:"button",onClick:()=>{P(!1),y({title:"",description:"",threshold:"simple_majority"})},className:"py-2 px-4 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium text-sm",children:e==="ru"?"Отмена":"Bekor qilish"})]})]})]}),a.agendaItems.length===0&&a.customItems.length===0&&r.jsx("p",{className:"text-sm text-red-500",children:e==="ru"?"Выберите хотя бы один вопрос или добавьте свой":"Kamida bitta savol tanlang yoki o'zingiznikini qo'shing"})]}),l===3&&r.jsx(r.Fragment,{children:r.jsxs("div",{className:"space-y-4",children:[r.jsxs("div",{className:"p-4 rounded-xl bg-gray-50",children:[r.jsx("h3",{className:"font-medium mb-3",children:e==="ru"?"Сводка":"Xulosa"}),r.jsxs("div",{className:"space-y-2 text-sm",children:[r.jsxs("div",{className:"flex justify-between",children:[r.jsx("span",{className:"text-gray-500",children:e==="ru"?"Формат:":"Format:"}),r.jsx("span",{className:"font-medium",children:a.format==="online"?e==="ru"?"Онлайн":"Onlayn":a.format==="offline"?e==="ru"?"Очное":"Yuzma-yuz":e==="ru"?"Смешанное":"Aralash"})]}),r.jsxs("div",{className:"flex justify-between",children:[r.jsx("span",{className:"text-gray-500",children:e==="ru"?"Дом:":"Uy:"}),r.jsx("span",{className:"font-medium",children:n.find(w=>w.id===a.buildingId)?.name||a.buildingAddress})]}),r.jsxs("div",{className:"flex justify-between",children:[r.jsx("span",{className:"text-gray-500",children:e==="ru"?"Организатор:":"Tashkilotchi:"}),r.jsx("span",{className:"font-medium",children:a.organizerType==="management"?e==="ru"?"УК":"UK":e==="ru"?"Житель":"Aholi"})]}),r.jsxs("div",{className:"flex justify-between",children:[r.jsx("span",{className:"text-gray-500",children:e==="ru"?"Вопросов:":"Savollar:"}),r.jsx("span",{className:"font-medium",children:a.agendaItems.length})]})]})]}),r.jsx("div",{className:"p-4 rounded-xl bg-blue-50 border border-blue-200",children:r.jsxs("div",{className:"flex items-start gap-3",children:[r.jsx(nr,{className:"w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5"}),r.jsx("div",{className:"text-sm text-blue-700",children:e==="ru"?"После публикации жильцам будет отправлено уведомление. Они смогут проголосовать за удобную дату проведения собрания.":"Nashrdan so'ng aholiga bildirishnoma yuboriladi. Ular yig'ilish uchun qulay sanani tanlashlari mumkin bo'ladi."})]})}),r.jsxs("div",{className:"p-4 rounded-xl bg-yellow-50 border border-yellow-200",children:[r.jsx("h4",{className:"font-medium mb-2",children:e==="ru"?"Повестка дня:":"Kun tartibi:"}),r.jsxs("ol",{className:"list-decimal list-inside space-y-1 text-sm",children:[a.agendaItems.map(w=>r.jsx("li",{children:e==="ru"?C[w].label:C[w].labelUz},w)),a.customItems.map((w,i)=>r.jsxs("li",{className:"text-blue-700",children:[w.title,r.jsxs("span",{className:"text-xs text-gray-500 ml-1",children:["(",e==="ru"?"свой вопрос":"o'z savoli",")"]})]},`custom-${i}`))]})]}),a.description&&r.jsxs("div",{className:"p-4 rounded-xl bg-gray-50 border border-gray-200",children:[r.jsx("h4",{className:"font-medium mb-2",children:e==="ru"?"Обоснование:":"Asoslash:"}),r.jsx("p",{className:"text-sm text-gray-600",children:a.description})]})]})})]}),r.jsxs("div",{className:"p-6 border-t border-gray-100 flex gap-3",children:[l>1&&r.jsx("button",{onClick:()=>b(l-1),disabled:u,className:"flex-1 py-3 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50",children:e==="ru"?"Назад":"Orqaga"}),l<3?r.jsx("button",{onClick:()=>b(l+1),disabled:l===1&&!a.buildingId||l===2&&a.agendaItems.length===0&&a.customItems.length===0,className:"flex-1 py-3 rounded-xl font-medium bg-orange-400 text-gray-900 hover:bg-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",children:e==="ru"?"Далее":"Keyingi"}):r.jsx("button",{onClick:N,disabled:u||!a.buildingId,className:"flex-1 py-3 rounded-xl font-medium bg-orange-400 text-gray-900 hover:bg-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",children:u?e==="ru"?"Создание...":"Yaratilmoqda...":e==="ru"?"Опубликовать":"Nashr qilish"})]})]})})}function kr({meeting:t,onClose:s,language:e,calculateResult:c,calculateQuorum:n}){const l=n(),[b,u]=j.useState(!1),f=async()=>{u(!0);try{const h=await fetch(`/api/meetings/${t.id}/protocol/data`);if(!h.ok)throw new Error("Failed to fetch protocol data");const P=await h.json();await _r({meeting:{...P.meeting,buildingAddress:t.buildingAddress||P.meeting.building_address},agendaItems:P.agendaItems,voteRecords:P.voteRecords,votesByItem:P.votesByItem,protocolHash:P.protocolHash})}catch{alert(e==="ru"?"Ошибка при скачивании протокола":"Bayonnomani yuklashda xato")}finally{u(!1)}};return r.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4",children:r.jsxs("div",{className:"bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto",children:[r.jsxs("div",{className:"p-6 border-b border-gray-100 flex items-center justify-between",children:[r.jsxs("div",{children:[r.jsx("h2",{className:"text-xl font-bold",children:e==="ru"?`Собрание #${t.number}`:`Yig'ilish #${t.number}`}),r.jsx("p",{className:"text-sm text-gray-500",children:t.buildingAddress})]}),r.jsxs("div",{className:"flex items-center gap-2",children:[["protocol_generated","protocol_approved"].includes(t.status)&&r.jsxs("button",{onClick:f,disabled:b,className:"flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition-colors disabled:opacity-50",children:[r.jsx(U,{className:"w-4 h-4"}),b?e==="ru"?"Загрузка...":"Yuklanmoqda...":e==="ru"?"Скачать протокол":"Bayonnomani yuklab olish"]}),r.jsx("button",{onClick:s,className:"p-2 hover:bg-gray-100 rounded-xl transition-colors",children:r.jsx(S,{className:"w-5 h-5"})})]})]}),r.jsxs("div",{className:"p-6 space-y-6",children:[r.jsxs("div",{className:"flex items-center gap-4 flex-wrap",children:[r.jsx("span",{className:`px-3 py-1 rounded-lg text-sm font-medium ${D[t.status]?.color==="green"?"bg-green-100 text-green-700":D[t.status]?.color==="blue"?"bg-blue-100 text-blue-700":D[t.status]?.color==="yellow"?"bg-yellow-100 text-orange-700":"bg-gray-100 text-gray-700"}`,children:e==="ru"?D[t.status]?.label:D[t.status]?.labelUz}),t.status!=="draft"&&t.status!=="pending_moderation"&&r.jsxs("div",{className:"flex items-center gap-2",children:[r.jsx(q,{className:"w-4 h-4 text-gray-400"}),r.jsxs("span",{className:"text-sm",children:[l.participated,"/",l.total," (",l.percent.toFixed(1),"%)"]}),r.jsx("span",{className:`text-xs px-2 py-0.5 rounded-full font-medium ${l.quorumReached?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`,children:l.quorumReached?e==="ru"?"Кворум":"Kvorum":e==="ru"?"Нет кворума":"Kvorum yo'q"})]})]}),t.confirmedDateTime&&r.jsxs("div",{className:"flex items-center gap-2 text-gray-600",children:[r.jsx(R,{className:"w-5 h-5"}),r.jsx("span",{children:new Date(t.confirmedDateTime).toLocaleDateString(e==="ru"?"ru-RU":"uz-UZ",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})})]}),r.jsxs("div",{children:[r.jsx("h3",{className:"font-medium mb-3",children:e==="ru"?"Повестка дня":"Kun tartibi"}),r.jsx("div",{className:"space-y-4",children:t.agendaItems.map((h,P)=>{const p=c(t.id,h.id);return r.jsx("div",{className:"p-4 rounded-xl bg-gray-50 border border-gray-200",children:r.jsxs("div",{className:"flex items-start justify-between gap-4",children:[r.jsxs("div",{className:"flex-1",children:[r.jsxs("div",{className:"font-medium",children:[P+1,". ",h.title]}),r.jsx("p",{className:"text-sm text-gray-500 mt-1",children:h.description}),["voting_open","voting_closed","results_published","protocol_generated","protocol_approved"].includes(t.status)&&r.jsxs("div",{className:"mt-3 pt-3 border-t border-gray-200",children:[r.jsxs("div",{className:"grid grid-cols-3 gap-2 text-sm",children:[r.jsxs("div",{className:"flex items-center gap-1",children:[r.jsx(ir,{className:"w-4 h-4 text-green-500"}),r.jsxs("span",{children:[p.votesFor," (",p.percentFor.toFixed(0),"%)"]})]}),r.jsxs("div",{className:"flex items-center gap-1",children:[r.jsx(cr,{className:"w-4 h-4 text-red-500"}),r.jsx("span",{children:p.votesAgainst})]}),r.jsxs("div",{className:"flex items-center gap-1",children:[r.jsx(dr,{className:"w-4 h-4 text-gray-400"}),r.jsx("span",{children:p.votesAbstain})]})]}),r.jsx("div",{className:"mt-2 h-2 bg-gray-200 rounded-full overflow-hidden",children:r.jsx("div",{className:`h-full ${p.thresholdMet?"bg-green-500":"bg-red-500"}`,style:{width:`${p.percentFor}%`}})}),r.jsxs("div",{className:"flex items-center justify-between mt-1 text-xs text-gray-500",children:[r.jsx("span",{children:"0%"}),r.jsxs("span",{children:[e==="ru"?"Порог:":"Chegara:"," ",k[h.threshold].percent,"%"]}),r.jsx("span",{children:"100%"})]})]})]}),h.isApproved!==void 0&&r.jsx("span",{className:`px-2 py-1 rounded-lg text-xs font-medium ${h.isApproved?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`,children:h.isApproved?e==="ru"?"Принято":"Qabul":e==="ru"?"Не принято":"Rad"})]})},h.id)})})]})]})]})})}export{Fr as MeetingsPage};
//# sourceMappingURL=MeetingsPage-1768735693672-y4CuKJOP.js.map
