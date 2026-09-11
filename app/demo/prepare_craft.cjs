// Read existing knowledge packages; build a verifiable, offline presentation snapshot.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(repo,p),'utf8');
const sources={};
function record(p){const value=read(p);sources[p]=crypto.createHash('sha256').update(value).digest('hex');return value;}
const people=JSON.parse(record('app/web/philosophers.json'));
const packages=people.map(person=>{
  const base='distill/packages/'+person.slug;
  const files=folder=>fs.readdirSync(path.join(repo,base,folder)).filter(n=>n.endsWith('.md')).sort();
  const entries=fs.readdirSync(path.join(repo,base,'corpus')).filter(n=>n.endsWith('.jsonl')).sort()
    .flatMap(n=>record(`${base}/corpus/${n}`).split('\n').filter(s=>s.trim()).map(s=>JSON.parse(s)));
  const counts={};
  for(const folder of ['frameworks','concepts','exemplars']){
    const names=files(folder);counts[folder]=names.length;names.forEach(n=>record(`${base}/${folder}/${n}`));
  }
  for(const file of ['persona.md','mappings.yaml','build/system-prompt.md'])record(`${base}/${file}`);
  return {slug:person.slug,name:person.name,corpus:new Set(entries.map(e=>e.id)).size,works:[...new Set(entries.map(e=>e.work))],...counts};
});
const desktop=require('./desktop-data.js'),q=desktop.quote;
const corpus=record('distill/packages/laozi/corpus/daodejing.jsonl').split('\n').filter(Boolean).map(s=>JSON.parse(s)).find(e=>e.id===q.corpus_id);
if(!corpus?.text.includes(q.quote))throw Error('The example quote must match its corpus verbatim');
const prompt=record('distill/packages/laozi/build/system-prompt.md');
for(const text of [q.quote,'概念：企者不立','框架：功成弗居','concepts/dao-24-tiptoe'])if(!prompt.includes(text))throw Error('Example is absent from the current compiled prompt: '+text);
for(const file of ['distill/tools/build_system_prompt.py','distill/tools/verify_quotes.py','app/server/engine.py','app/server/chat_service.py'])record(file);
const data={packages,totals:{people:packages.length,...Object.fromEntries(['corpus','frameworks','concepts','exemplars'].map(key=>[key,packages.reduce((n,p)=>n+p[key],0)]))},
  example:{quote:q.quote,locus:q.locus,corpusId:q.corpus_id,concept:q.concept,plain:desktop.plain,
    framework:'功成弗居（不自见的光）',frameworkSummary:'把“被看见”从目标降级为副产品，区分做实事与维持表演的消耗。',
    persona:'短句、对偶、悖论与留白。',dilemmas:'冒名顶替感 · 社会评价',
    materials:['distill/packages/laozi/corpus/daodejing.jsonl',desktop.sourceCard,'distill/packages/laozi/frameworks/merit-without-claiming.md','distill/packages/laozi/persona.md','distill/packages/laozi/mappings.yaml','distill/packages/laozi/build/system-prompt.md']},
  method:'原著与思想的内容蒸馏：结构化知识包编译为 System Prompt，结合对话上下文交由语言模型生成；未涉及模型权重训练。',sources};
fs.writeFileSync(path.join(__dirname,'craft-data.js'),`(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PhiloCraftData=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>(${JSON.stringify(data).replace(/</g,'\\u003c')}));\n`);
console.log(`Knowledge snapshot: ${data.totals.people} philosophers, ${data.totals.corpus} corpus entries, ${data.totals.frameworks} frameworks, ${data.totals.concepts} concepts.`);
