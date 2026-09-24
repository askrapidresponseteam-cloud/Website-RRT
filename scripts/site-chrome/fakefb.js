// Fake Firebase compat SDK for offline testing of On Record / vet / manage pages.
(function(){
  var __fb=window.__fb={calls:[],uploads:[],docs:{publicReports:[
    {id:'c1',data:{incidentType:'Poisoning',severity:'high',state:'Karnataka',district:'Udupi',description:'Dogs poisoned near the market in Udupi.',createdAt:{toMillis:function(){return Date.now()-3600e3}},amplifyCount:4,status:'open',imageUrl:'https://cdn.shopify.com/s/files/mock/3.png'}},
    {id:'c2',data:{incidentType:'Beating',severity:'medium',state:'Maharashtra',district:'Mumbai',description:'Stray beaten by guard.',createdAt:{toMillis:function(){return Date.now()-86400e3}},amplifyCount:1,status:'open'}}
  ]}};
  function snap(list){return {docs:list.map(function(d){return {id:d.id,data:function(){return d.data},exists:true}}),empty:!list.length,size:list.length,forEach:function(f){this.docs.forEach(f)}}}
  function query(name,filters){
    var q={_n:name,_f:filters||[],orderBy:function(){return q},limit:function(){return q},where:function(a,b,c){return query(name,(filters||[]).concat([[a,b,c]]))},startAfter:function(){return q},
      get:function(){__fb.calls.push(['get',name,JSON.stringify(q._f)]);return Promise.resolve(snap(__fb.docs[name]||[]))},
      onSnapshot:function(cb){cb(snap(__fb.docs[name]||[]));return function(){}},
      doc:function(id){return {id:id,get:function(){__fb.calls.push(['docget',name,id]);var d=(__fb.docs[name]||[]).filter(function(x){return x.id===id})[0];return Promise.resolve({exists:!!d,id:id,data:function(){return d?d.data:undefined}})},
        onSnapshot:function(cb){var d=(__fb.docs[name]||[]).filter(function(x){return x.id===id})[0];cb({exists:!!d,data:function(){return d?d.data:{}}});return function(){}},
        set:function(_v){__fb.calls.push(['set',name,id]);return Promise.resolve()},update:function(_v){__fb.calls.push(['update',name,id]);return Promise.resolve()}}},
      add:function(_v){__fb.calls.push(['add',name]);return Promise.resolve({id:'new1'})}};
    return q;
  }
  var fs={collection:function(n){return query(n)},doc:function(p){var a=p.split('/');return query(a[0]).doc(a[1])},settings:function(){},enablePersistence:function(){return Promise.resolve()}};
  var FieldValue={serverTimestamp:function(){return {ts:1}},increment:function(n){return {inc:n}},arrayUnion:function(){return {}}};
  var st={ref:function(path){return {put:function(_file){__fb.uploads.push(path);var r={ref:{getDownloadURL:function(){return Promise.resolve('https://firebasestorage.googleapis.com/v0/b/x/o/'+encodeURIComponent(path)+'?alt=media')}}};var p=Promise.resolve(r);p.on=function(){};return p},child:function(){return this}}}};
  var fns={httpsCallable:function(name){return function(payload){__fb.calls.push(['fn',name,payload]);
    if(name==='submitReport')return Promise.resolve({data:{reportId:'RR-TEST-001',manageToken:'tok123',manageUrl:'https://rapid-response.in/report/manage?t=tok123'}});
    return Promise.resolve({data:{ok:true,matches:[],nearby:[]}})}},useEmulator:function(){}};
  var app={firestore:function(){return fs},storage:function(){return st},functions:function(){return fns},auth:function(){return auth}};
  var listeners=[];var auth={currentUser:null,onAuthStateChanged:function(cb){listeners.push(cb);setTimeout(function(){cb(auth.currentUser)},0);return function(){}},
    signInAnonymously:function(){auth.currentUser={uid:'anon1',isAnonymous:true,getIdToken:function(){return Promise.resolve('tok')}};listeners.forEach(function(f){setTimeout(function(){f(auth.currentUser)},0)});return Promise.resolve({user:auth.currentUser})},
    signOut:function(){auth.currentUser=null;return Promise.resolve()},setPersistence:function(){return Promise.resolve()}};
  window.firebase={apps:[],initializeApp:function(){this.apps.push(app);return app},app:function(){return app},
    firestore:Object.assign(function(){return fs},{FieldValue:FieldValue,Timestamp:{now:function(){return {toMillis:function(){return Date.now()}}},fromMillis:function(m){return {toMillis:function(){return m}}}},GeoPoint:function(a,b){this.latitude=a;this.longitude=b}}),
    storage:function(){return st},functions:function(){return fns},auth:function(){return auth}};
})();
