#!/bin/bash

node ../jalangi/src/js/commands/instrumentDir.js --copy_runtime --jalangi_root ../jalangi --relative --smemory --inbrowser --analysis src/js/analyses/CommonUtil.js:src/js/analyses/inconsistentType/TypeAnalysis.js:src/js/analyses/inconsistentType/InconsistentTypeEngine.js tests/inconsistentType/ instrumented/