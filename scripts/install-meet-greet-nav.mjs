#!/usr/bin/env node
/** Apply after every Expo web export; preserve the current hashed JS bundle. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function installNavigation(html) {
  if(html.includes('id="meet-greet-entry"'))return html;
  if(!html.includes('<div id="root"></div>')||!html.includes('</head>'))throw new Error('Unknown Expo HTML shape; original left unchanged');
  const style='<style id="meet-greet-nav-style">body{display:flex;flex-direction:column;margin:0}#root{height:auto;min-height:0;flex:1}#meet-greet-entry{flex:0 0 auto;padding:7px 16px;background:#f6f2fc;text-align:right;font:13px/1.5 system-ui,sans-serif}#meet-greet-entry a{color:#6139a0}#meet-greet-entry a:focus-visible{outline:2px solid #6139a0;outline-offset:3px}</style>';
  const nav='<nav id="meet-greet-entry" aria-label="ミーグリ情報"><a href="./meet-greet/">ミーグリ完売表・前作比較 →</a></nav>';
  return html.replace('</head>',style+'\n</head>').replace('<div id="root"></div>',nav+'\n<div id="root"></div>');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const file=process.argv[2];
  if(!file){console.error('Usage: node scripts/install-meet-greet-nav.mjs EXPORT_DIR/index.html');process.exitCode=1;}
  else {try{const html=await fs.readFile(file,'utf8'),updated=installNavigation(html);if(updated!==html){const temp=`${file}.meet-greet.tmp`;await fs.writeFile(temp,updated);await fs.rename(temp,file);}}catch(e){console.error(e.message);process.exitCode=1;}}
}
