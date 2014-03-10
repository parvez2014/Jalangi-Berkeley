/*
 * Copyright 2014 University of California, Berkeley.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Author: Liang Gong

J$.analysis = {};

((function (sandbox){
    function JITAware() {
        var Constants = (typeof sandbox.Constants === 'undefined' ? require('./Constants.js') : sandbox.Constants);
        var smemory = sandbox.Globals.smemory;
        var iidToLocation = Constants.load("iidToLocation");

        // simulate stack trace in normal execution

        ///////////////////////////////////////////////////
        var analysisDB = {};

        var ISNAN = isNaN;
        var PARSEINT = parseInt;
        var HOP = Constants.HOP;
        var cache_sig = true;

        var obj_id = 1;
        function getNextObjId() {
            return obj_id++;
        }

        this.getAnalysisDB = function() {
            return analysisDB;
        }

        this.setAnalysisDB = function(db) {
            analysisDB = db;
        }

        function getByIndexArr (indexArr) {
            var curDB = analysisDB;
            for (var i=0; i<indexArr.length; i++) {
                if (!HOP(curDB, indexArr[i] + "")) {
                    return undefined;
                }
                curDB = curDB[indexArr[i] + ""];
            }
            return curDB;
        }

        function setByIndexArr (indexArr, data) {
            var curDB = analysisDB;
            for (var i=0; i<indexArr.length - 1; i++) {
                if (!HOP(curDB, indexArr[i] + "")) {
                    curDB[indexArr[i] + ""] = {};
                }
                curDB = curDB[indexArr[i] + ""];
            }

            curDB[indexArr[indexArr.length - 1] + ""] = data;
        }

        function addCountByIndexArr (indexArr) {
            var metaData = getByIndexArr(indexArr);
            if(typeof metaData === 'undefined'){
                setByIndexArr(indexArr, {'count': 1});
            } else{
                metaData.count++;
            }
        }

        function getCountByIndexArr (indexArr) {
            var metaData = getByIndexArr(indexArr);
            if(typeof metaData === 'undefined'){
                return undefined;
            } else{
                return metaData.count;
            }
        }

        /////////////////////////////////////////

        var total_get_sig_cnt = 0;

        function getObjSig(obj) {
            total_get_sig_cnt++;

            if(!cache_sig){
                return generateObjSig(obj);
            }

            // if signature exists return it
            var shadow_obj = smemory.getShadowObject(obj);
            if(shadow_obj && shadow_obj.sig){
                return shadow_obj.sig
            }

            // generate and record signature
            var sig = generateObjSig(obj);

            if(shadow_obj){
                shadow_obj.sig = sig;
            }
            return sig;
        }

        function updateObjSig(obj){
            if(!cache_sig){
                return ;
            }

            var shadow_obj = smemory.getShadowObject(obj);
            if(shadow_obj){
                var sig = generateObjSig(obj);
                shadow_obj.sig = sig
            }
        }

        function isArr(obj){
            return Array.isArray(obj) || (obj && obj.constructor && (obj instanceof Uint8Array || obj instanceof Uint16Array || 
                    obj instanceof Uint32Array || obj instanceof Uint8ClampedArray || 
                    obj instanceof ArrayBuffer || obj instanceof Int8Array || obj instanceof Int16Array ||
                    obj instanceof Int32Array || obj instanceof Float32Array || obj instanceof Float64Array));

                /*(obj.constructor.name === 'Uint8Array' || obj.constructor.name === 'Uint16Array' || 
                    obj.constructor.name === 'Uint32Array' || obj.constructor.name === 'Uint8ClampedArray' || 
                    obj.constructor.name === 'ArrayBuffer' || obj.constructor.name === 'Int8Array' || obj.constructor.name === 'Int16Array' ||
                    obj.constructor.name === 'Int32Array' || obj.constructor.name === 'Int8ClampedArray' || obj.constructor.name === 'Float32Array' || obj.constructor.name === 'Float64Array'));
                */
        }

        var total_signature_generation_cnt = 0;

        function generateObjSig(obj){
            total_signature_generation_cnt++;
            //return '1';
            var sig = {};
            var obj_layout  = '';
            var cnt = 0;
            try{
                if (isArr(obj)){
                    obj_layout += 'no_sig_for_array|';
                } else if((typeof obj ==='object' || typeof obj ==='function') && obj !== null){
                    //console.log('begin');
                    
                    //console.log('obj constructor: ' + obj.constructor.name);
                    for (var prop in obj) {
                        cnt++;
                        if (HOP(obj,prop)) {
                            if(!isNormalNumber(prop)){ // if prop is number e.g., '0', '1' etc. then do not add it into the prop
                                obj_layout += prop + '|';
                            }
                        }
                    }
                    //console.log('end');
                    //console.log('prop cnt: ' + cnt);
                    //console.log('obj_layout: ' + obj_layout);
                }

                sig = {'obj_layout': obj_layout, 'pto': 'empty', 'con': 'empty'};
                sig.pto = obj.__proto__;
                sig.con = obj.constructor;

                // record object inforamtion that corresponds to each signature (hidden class)
                var shadow_obj = smemory.getShadowObject(obj);
                sig.sterm_obj = obj;
            } catch(e) {
                sig = 'exception when generating signature';
            }
            return sig;
        }

        function isEqualObjSig (sig1, sig2) {
            if(sig1.obj_layout === sig2.obj_layout && sig1.pto === sig2.pto && sig1.con === sig2.con) {
                return true;
            } else {
                return false;
            }
        }

        function objSigToString (sig) {
            var str = '';
            try {
                var sterm_obj = sig.sterm_obj;
                sig.sterm_obj = 'hide';
                str += JSON.stringify(sig);
                sig.sterm_obj = sterm_obj;
                if(sig.con && sig.con.name){
                    str = str + " | constructor: " + sig.con.name;
                }

                if(sig.pto && sig.pto.constructor){
                    str = str + " | proto constructor: " + sig.pto.constructor.name;
                }
            }catch(e) {
                console.log(e);
                str = sig.obj_layout + ' | constructor or prototype cannot be stringified';
            }
            return str;
        }

        function isNormalNumber(num) {
            if (typeof num === 'number' && !ISNAN(num)) {
                return true;
            } else if (typeof num === 'string' && (PARSEINT(num)+"" === num)) {
                return true;
            }
            return false;
        }

        var warning_limit = 30;

        this.setWarningLimit = function(newlimit){
            warning_limit = newlimit;
        }

        var regex_match = /id:[ ]([^ ]*)[ ]iid:[ ]([^ \)]*)/;

        this.printResult = function() {
            try{
                var num = 0;
                console.log("----------------------------");
                console.log('Report of polymorphic statements:');

                // first sort the results
                var jitArr = [];
                var jitResult = getByIndexArr(['JIT-checker', 'polystmt']);
                for (var prop in jitResult) {
                    if (HOP(jitResult, prop)) {
                        var query_sig = jitResult[prop];
                        if(query_sig && query_sig.length > 1){
                            jitArr.push({'sigList': query_sig, 'iid': PARSEINT(prop)});
                            num++;
                        }
                    }
                }

                // extract the second most frequently used signature count
                jitArr.sort(function compare(a, b) {
                    var mostFreq = 0;
                    var secMostFreq = 0;
                    var curCnt = 0;
                    for(var i=0;i<a.sigList.length;i++){
                        curCnt = a.sigList[i].count;
                        if(mostFreq < curCnt) {
                            secMostFreq = mostFreq;
                            mostFreq = curCnt;
                        } else if (secMostFreq < curCnt) {
                            secMostFreq = curCnt;
                        }
                    }

                    while(mostFreq >= 1){
                        mostFreq /= 10.0;
                    }

                    var weightA = secMostFreq + mostFreq;

                    mostFreq = 0;
                    secMostFreq = 0;
                    for(var i=0;i<b.sigList.length;i++){
                        curCnt = b.sigList[i].count;
                        if(mostFreq < curCnt) {
                            secMostFreq = mostFreq;
                            mostFreq = curCnt;
                        } else if (secMostFreq < curCnt) {
                            secMostFreq = curCnt;
                        }
                    }

                    while(mostFreq >= 1){
                        mostFreq /= 10.0;
                    }

                    var weightB = secMostFreq + mostFreq;

                    // sort in descending order
                    return weightB - weightA;
                });
                try{
                for(var i=0;i<jitArr.length && i<warning_limit ;i++) {
                    var query_sig = jitArr[i].sigList;
                    if(query_sig && query_sig.length > 1){
                        console.log('------');
                        console.log('[location: ' + iidToLocation(jitArr[i].iid) + '] <- No. layouts: ' + query_sig.length);
                        for(var j=0;j<query_sig.length;j++) {
                            console.log('count: ' + query_sig[j].count + ' -> layout:' + objSigToString(query_sig[j].sig));
                            var num_obj = 0;
                            var num_create_location = 0;
                            var set = {};
                            var locations = {};
                            instance_loop:
                            for(var objId in query_sig[j].instances){
                                if(HOP(query_sig[j].instances, objId)){
                                    //console.log('\tobjId: ' + objId + '\t|\tcount: ' + query_sig[j].instances[objId]);
                                    if(objId.indexOf('unknown')>=0){
                                        continue instance_loop;
                                    }
                                    var result = regex_match.exec(objId);
                                    var id = result[1];
                                    var iid = result[2];
                                    if(!set[id]){
                                        set[id] = 1;
                                        num_obj++;
                                    }
                                    if(locations[iid]){
                                        locations[iid] += query_sig[j].instances[objId];
                                    } else {
                                        locations[iid] = query_sig[j].instances[objId];
                                    }
                                }
                            }
                            console.log('\tTotal distinct obj: ' + num_obj); //+ '\r\n\t' + 'Obj create locations & counts: ' + JSON.stringify(locations);
                            for(var iid in locations){
                                if(HOP(locations, iid)){
                                    console.log('\toccurrance: ' + locations[iid] + '\t location: ' + iidToLocation(iid));
                                }
                            }
                        }
                    }
                }
                }catch(e){
                    console.log(e);
                    console.log(e.stack);
                }
                console.log('...');
                console.log('Number of polymorphic statements spotted: ' + num);
                console.log("---------------------------");

                console.log('Report of loading undeclared or deleted array elements:')
                var uninitArrDB = getByIndexArr(['JIT-checker', 'uninit-array-elem']);
                num = 0;
                var jitUninitArr = [];
                for(var prop in uninitArrDB) {
                    if (HOP(uninitArrDB, prop)) {
                        jitUninitArr.push({'iid': prop, 'count': uninitArrDB[prop].count});
                        num++;
                    }
                }
                jitUninitArr.sort(function compare(a, b) {
                    return b.count - a.count;
                });
                for(var i=0;i<jitUninitArr.length && i< warning_limit;i++){
                    console.log('[location: ' + iidToLocation(jitUninitArr[i].iid) + '] <- No. usages: ' + jitUninitArr[i].count);
                }
                console.log('...');
                console.log('Number of loading undeclared or deleted array elements spotted: ' + num);


                console.log("---------------------------");
                console.log('Report of switching array type');
                var switchArrTypeArr = [];
                var switchArrTypeDB = getByIndexArr(['JIT-checker', 'arr-type-switch']);
                num = 0;
                for(var prop in switchArrTypeDB) {
                    if (HOP(switchArrTypeDB, prop)) {
                        switchArrTypeArr.push({'iid': prop, 'count': switchArrTypeDB[prop].count});
                        num++;
                    }
                }
                switchArrTypeArr.sort(function compare(a, b) {
                    return b.count - a.count;
                });
                for(var i=0;i<switchArrTypeArr.length && i< warning_limit;i++){
                    console.log('[location: ' + iidToLocation(switchArrTypeArr[i].iid) + '] <- No. usages: ' + switchArrTypeArr[i].count);
                }
                console.log('...');
                console.log('Number of switching array type spotted: ' + num);
                console.log("---------------------------");

                console.log('Report of making incontiguous array:')
                var incontArrDBArr = [];
                var incontArrDB = getByIndexArr(['JIT-checker', 'incont-array']);
                num = 0;
                for(var prop in incontArrDB) {
                    if (HOP(incontArrDB, prop)) {
                        incontArrDBArr.push({'iid': prop, 'count': incontArrDB[prop].count});
                        num++;
                    }
                }
                incontArrDBArr.sort(function compare(a, b) {
                    return b.count - a.count;
                });
                for(var i=0;i<incontArrDBArr.length && i< warning_limit;i++){
                    console.log('[location: ' + iidToLocation(incontArrDBArr[i].iid) + '] <- No. usages: ' + incontArrDBArr[i].count);
                }
                console.log('...');
                console.log('Number of putting incontiguous array statements: ' + num);
                console.log('Why: In order to handle large and sparse arrays, there are two types of array storage internally:\n' +
                    '\t * Fast Elements: linear storage for compact key sets\n' +
                    '\t * Dictionary Elements: hash table storage otherwise\n' +
                    'It\'s best not to cause the array storage to flip from one type to another.');
                console.log("---------------------------");

                console.log('Report of initialize object field in non-constructor:');
                var initObjNonConstrArr = [];
                var initObjNonConstrDB = getByIndexArr(['JIT-checker', 'init-obj-nonconstr']);
                num = 0;
                for(var prop in initObjNonConstrDB) {
                    if (HOP(initObjNonConstrDB, prop)) {
                        initObjNonConstrArr.push({'iid': prop, 'count': initObjNonConstrDB[prop].count});
                        num++;
                    }
                }
                initObjNonConstrArr.sort(function compare(a, b) {
                    return b.count - a.count;
                });
                for(var i=0;i<initObjNonConstrArr.length && i< warning_limit;i++){
                    console.log('[location: ' + iidToLocation(initObjNonConstrArr[i].iid) + '] <- No. usages: ' + initObjNonConstrArr[i].count);
                }
                console.log('Number of statements init objects in non-constructor: ' + num);
                console.log("---------------------------");
                console.log('total signature generated: ' + total_signature_generation_cnt);
                console.log('total get signature: ' + total_get_sig_cnt);
            }catch(e) {
                console.log("error!!");
                console.log(e);
            }
        }



        function checkIfObjectIsPolymorphic(base, iid){
            if (isArr(base)) {
                return;
            }
            var sig = getObjSig(base);
            var sterm_objId;
            if(sig.sterm_obj){
                var shadow_obj = smemory.getShadowObject(sig.sterm_obj);
                if(shadow_obj){
                    sterm_objId = shadow_obj.objId;
                }
            }
            if(!sterm_objId){
                sterm_objId = 'unknown(external)';
            }
            var query_sig = getByIndexArr(['JIT-checker', 'polystmt', iid]);
            if(typeof query_sig === 'undefined') {
                // add object instance information associated with the hidden class to the database
                var info_to_store = [{'count': 1, 'sig': sig}];
                info_to_store[0].instances = {};
                info_to_store[0].instances[sterm_objId] = 1;
                setByIndexArr(['JIT-checker', 'polystmt', iid], info_to_store);
            } else {
                outter: {
                    for(var i=0;i<query_sig.length;i++){
                        if(isEqualObjSig(query_sig[i].sig, sig)) {
                            query_sig[i].count++;

                            // record object instance information associated with each signature (hidden class)
                            if(query_sig[i].instances){
                                if(query_sig[i].instances[sterm_objId]){
                                    query_sig[i].instances[sterm_objId]++;
                                } else {
                                    query_sig[i].instances[sterm_objId] = 1;
                                }
                            } else {
                                query_sig[i].instances = {};
                                query_sig[i].instances[sterm_objId] = 1;
                            }

                            break outter;
                        }
                    }

                    var info_to_store = {'count': 1, 'sig': sig, instances: {}};
                    info_to_store.instances[sterm_objId] = 1;
                    query_sig.push(info_to_store);
                }
            }
        }

        function checkIfReadingAnUninitializedArrayElement(base, offset, iid) {
            if(isArr(base)){
                // check using uninitialized
                if(isNormalNumber(offset) && !HOP(base, offset+'')) {
                    addCountByIndexArr(['JIT-checker', 'uninit-array-elem', iid]);
                }
            }
        }

        function checkIfArrayIsNumeric(base, val, iid) {
            // attach a meta data 'numeric' or 'non-numeric' to this array
            // if the meta data does not exist, check the type of this array
            var shadow = smemory.getShadowObject(base);
            if(shadow && shadow.arrType === undefined) {
                shadow.arrType = 'unknown';
                inner:
                    for(var i=0;i<base.length;i++){
                        if(typeof base[i] !== 'number' && typeof base[i] !== 'undefined') {
                            shadow.arrType = 'non-numeric';
                            break inner;
                        }
                        shadow.arrType = 'numeric';
                    }
            }

            // for now this code does not check switching from non-numeric array to numeric, as it might be expensive
            if(shadow && shadow.arrType === 'numeric') {
                if(typeof val !== 'number' && typeof val !== 'undefined') {
                    addCountByIndexArr(['JIT-checker', 'arr-type-switch', iid]);
                    shadow.arrType = 'non-numeric';
                }
            }
        }


        function checkIfWritingOutsideArrayBound(base, offset, iid) {
            if(base.length < offset) {
                addCountByIndexArr(['JIT-checker', 'incont-array', iid]);
            }

        }


        var consStack = (function() {
            var stack = [{}];

            return {
                push: function(f, isConstructor, iid) {
                    stack.push({"fun": f, "isCon": isConstructor, 'iid': iid});
                },
                pop: function() {
                    return stack.pop();
                },
                isConstructor: function(dis) {
                    var elem = stack[stack.length-1];
                    return elem.isCon && dis instanceof elem.fun;
                },
                peek: function(){
                    return stack[stack.length-1];
                }
            }

        }());

        function checkIfFieldAddedOutsideConstructor(base, offset, iid) {
            if(!HOP(base,offset)) { // check init object members in non-consturctor functions
                if (!consStack.isConstructor(base)) {
                    addCountByIndexArr(['JIT-checker', 'init-obj-nonconstr', iid]);
                }
            }
        }

        function checkUpdateObjIdSync(obj){
            if(obj){
                var shadow_obj = smemory.getShadowObject(obj);
                if(shadow_obj){
                    if (consStack.isConstructor(obj)) { // update the objId
                        // obj id to the object instance to be created
                        if(!shadow_obj.objId) {
                            shadow_obj.objId = '(id: ' + getNextObjId() + ' iid: ' + consStack.peek().iid + ')';
                        }
                    }
                    if(shadow_obj.objId && shadow_obj.sig && (shadow_obj.sig.sterm_objId === 'unknown(external)' || !shadow_obj.sig.sterm_objid)){
                        shadow_obj.sig.sterm_objId = shadow_obj.objId;
                    }
                }
            }
        }

        this.getFieldPre = function (iid, base, offset){
            checkUpdateObjIdSync(base);
        }

        this.getField = function(iid, base, offset, val) {
            if(base){
                checkIfReadingAnUninitializedArrayElement(base, offset, iid);
                checkIfObjectIsPolymorphic(base, iid);
            }

            return val;
        }

        var instCnt = 0;

        this.putFieldPre = function (iid, base, offset, val) {
            instCnt++;
            if(((instCnt)%50000) === 0){
                //process.stdout.write(instCnt + '\r');
                console.log('put field operations processed: ' + instCnt);
            }

            checkUpdateObjIdSync(base);
            
            if (base !== null && base !== undefined) {
                if(isArr(base) && isNormalNumber(offset)) {
                    checkIfArrayIsNumeric(base, val, iid);
                    checkIfWritingOutsideArrayBound(base, offset, iid);
                } else { // check init object members in non-consturctor functions
                    checkIfFieldAddedOutsideConstructor(base, offset, iid);
                }
            }
            return val;
        }

        this.putField = function (iid, base, offset, val) {
            // update object's shadow signature
            updateObjSig(base);
            return val;
        }

        this.literalPre = function (iid, val) {
            if(!val) return ;
            
            var shadow_obj = smemory.getShadowObject(val);
            if(shadow_obj && !shadow_obj.objId) {
                shadow_obj.objId = '(id: ' + getNextObjId() + ' iid: ' + iid+ ')';
            }
        }

        this.invokeFunPre = function(iid, f, base, args, isConstructor) {
            consStack.push(f, isConstructor, iid);
        }

        this.invokeFun = function (iid, f, base, args, val, isConstructor) {
            checkUpdateObjIdSync(val);
            if(isConstructor){ // check the return value of the constructor 
                checkIfObjectIsPolymorphic(val, iid);
            }
            consStack.pop();
            return val;
        }

        this.endExecution = function() {
            console.log('\n\n');
            this.printResult();
        }
    }

    if (sandbox.Constants.isBrowser) {
        sandbox.analysis = new JITAware();
        window.addEventListener('keydown', function (e) {
            // keyboard shortcut is Alt-Shift-T for now
            if (e.altKey && e.shiftKey && e.keyCode === 84) {
                sandbox.analysis.endExecution();
            }
        });
    } else {
        module.exports = JITAware;
    }

})(typeof J$ === 'undefined'? (J$={}):J$));

//@todo: check polymorphism for each iid location
//@todo: make the checker efficient (append property on signature during put field)
//@todo: finish experiments on octane benchmark
//@todo: do experiment on JSBench
//@todo: record number of different objects (for each distinct hidden class for each polymorphic code)
//@todo: for each signature property, remeber where the property was appended(iid)
//@todo: delete a.b  (transform into) -->> a = J$.De(‘a’, a, ‘b’, b)

//done:
//@todo: currently run_test.js does not support iid to location transition (done)

