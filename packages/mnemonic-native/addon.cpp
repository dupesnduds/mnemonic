#include <node.h>
#include <node_object_wrap.h>
#include "memory_engine.h"
#include <v8.h>

namespace brains_addon {

using v8::Context;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::Isolate;
using v8::Local;
using v8::Number;
using v8::Object;
using v8::ObjectTemplate;
using v8::Persistent;
using v8::String;
using v8::Value;
using v8::Boolean;
using v8::Array;
using v8::Exception;

class MemoryEngineWrapper : public node::ObjectWrap {
public:
    static void Init(Local<Object> exports);

private:
    explicit MemoryEngineWrapper();
    ~MemoryEngineWrapper();

    static void New(const FunctionCallbackInfo<Value>& args);
    static void Initialize(const FunctionCallbackInfo<Value>& args);
    static void StoreSolution(const FunctionCallbackInfo<Value>& args);
    static void FindSolution(const FunctionCallbackInfo<Value>& args);
    static void CategorizeError(const FunctionCallbackInfo<Value>& args);
    static void GetStatistics(const FunctionCallbackInfo<Value>& args);
    static void Clear(const FunctionCallbackInfo<Value>& args);
    static void LoadSolutions(const FunctionCallbackInfo<Value>& args);

    static Persistent<Function> constructor;
    brains::MemoryEngine* engine_;
};

class EnhancedMemoryEngineWrapper : public node::ObjectWrap {
public:
    static void Init(Local<Object> exports);

private:
    explicit EnhancedMemoryEngineWrapper();
    ~EnhancedMemoryEngineWrapper();

    static void New(const FunctionCallbackInfo<Value>& args);
    static void Initialize(const FunctionCallbackInfo<Value>& args);
    static void StoreSolution(const FunctionCallbackInfo<Value>& args);
    static void FindSolution(const FunctionCallbackInfo<Value>& args);
    static void FindRankedSolutions(const FunctionCallbackInfo<Value>& args);
    static void GetSuggestions(const FunctionCallbackInfo<Value>& args);
    static void CategorizeError(const FunctionCallbackInfo<Value>& args);
    static void GetStatistics(const FunctionCallbackInfo<Value>& args);
    static void Clear(const FunctionCallbackInfo<Value>& args);

    static Persistent<Function> constructor;
    brains::EnhancedMemoryEngine* engine_;
};

Persistent<Function> MemoryEngineWrapper::constructor;

MemoryEngineWrapper::MemoryEngineWrapper() {
    engine_ = new brains::MemoryEngine();
}

MemoryEngineWrapper::~MemoryEngineWrapper() {
    delete engine_;
}

void MemoryEngineWrapper::Init(Local<Object> exports) {
    Isolate* isolate = exports->GetIsolate();
    Local<Context> context = isolate->GetCurrentContext();

    Local<FunctionTemplate> tpl = FunctionTemplate::New(isolate, New);
    tpl->SetClassName(String::NewFromUtf8(isolate, "MemoryEngine").ToLocalChecked());
    tpl->InstanceTemplate()->SetInternalFieldCount(1);

    // Prototype methods
    NODE_SET_PROTOTYPE_METHOD(tpl, "initialize", Initialize);
    NODE_SET_PROTOTYPE_METHOD(tpl, "storeSolution", StoreSolution);
    NODE_SET_PROTOTYPE_METHOD(tpl, "findSolution", FindSolution);
    NODE_SET_PROTOTYPE_METHOD(tpl, "categorizeError", CategorizeError);
    NODE_SET_PROTOTYPE_METHOD(tpl, "getStatistics", GetStatistics);
    NODE_SET_PROTOTYPE_METHOD(tpl, "clear", Clear);
    NODE_SET_PROTOTYPE_METHOD(tpl, "loadSolutions", LoadSolutions);

    Local<Function> constructor_local = tpl->GetFunction(context).ToLocalChecked();
    constructor.Reset(isolate, constructor_local);
    exports->Set(context, String::NewFromUtf8(isolate, "MemoryEngine").ToLocalChecked(),
                 constructor_local).FromJust();
}

void MemoryEngineWrapper::New(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    Local<Context> context = isolate->GetCurrentContext();

    if (args.IsConstructCall()) {
        MemoryEngineWrapper* obj = new MemoryEngineWrapper();
        obj->Wrap(args.This());
        args.GetReturnValue().Set(args.This());
    } else {
        const int argc = 0;
        Local<Value> argv[argc];
        Local<Function> cons = Local<Function>::New(isolate, constructor);
        Local<Object> result = cons->NewInstance(context, argc, argv).ToLocalChecked();
        args.GetReturnValue().Set(result);
    }
}

void MemoryEngineWrapper::Initialize(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    Local<Context> context = isolate->GetCurrentContext();

    MemoryEngineWrapper* obj = ObjectWrap::Unwrap<MemoryEngineWrapper>(args.Holder());

    if (args.Length() < 1 || !args[0]->IsObject()) {
        isolate->ThrowException(Exception::TypeError(
            String::NewFromUtf8(isolate, "Expected object with error categories").ToLocalChecked()));
        return;
    }

    Local<Object> categories_obj = args[0]->ToObject(context).ToLocalChecked();
    Local<Array> category_names = categories_obj->GetPropertyNames(context).ToLocalChecked();

    std::unordered_map<std::string, std::vector<std::string>> categories;

    for (uint32_t i = 0; i < category_names->Length(); i++) {
        Local<Value> key = category_names->Get(context, i).ToLocalChecked();
        Local<Value> value = categories_obj->Get(context, key).ToLocalChecked();

        if (!key->IsString() || !value->IsArray()) continue;

        std::string category_name = *String::Utf8Value(isolate, key);
        Local<Array> patterns_array = Local<Array>::Cast(value);

        std::vector<std::string> patterns;
        for (uint32_t j = 0; j < patterns_array->Length(); j++) {
            Local<Value> pattern_val = patterns_array->Get(context, j).ToLocalChecked();
            if (pattern_val->IsString()) {
                patterns.push_back(*String::Utf8Value(isolate, pattern_val));
            }
        }

        categories[category_name] = patterns;
    }

    bool success = obj->engine_->initialize(categories);
    args.GetReturnValue().Set(Boolean::New(isolate, success));
}

void MemoryEngineWrapper::StoreSolution(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();

    MemoryEngineWrapper* obj = ObjectWrap::Unwrap<MemoryEngineWrapper>(args.Holder());

    if (args.Length() < 3) {
        isolate->ThrowException(Exception::TypeError(
            String::NewFromUtf8(isolate, "Expected (problem, category, solution[, isGlobal])").ToLocalChecked()));
        return;
    }

    std::string problem = *String::Utf8Value(isolate, args[0]);
    std::string category = *String::Utf8Value(isolate, args[1]);
    std::string solution = *String::Utf8Value(isolate, args[2]);
    bool is_global = args.Length() > 3 ? args[3]->BooleanValue(isolate) : false;

    bool success = obj->engine_->storeSolution(problem, category, solution, is_global);
    args.GetReturnValue().Set(Boolean::New(isolate, success));
}

void MemoryEngineWrapper::FindSolution(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    Local<Context> context = isolate->GetCurrentContext();

    MemoryEngineWrapper* obj = ObjectWrap::Unwrap<MemoryEngineWrapper>(args.Holder());

    if (args.Length() < 1) {
        isolate->ThrowException(Exception::TypeError(
            String::NewFromUtf8(isolate, "Expected (problem[, category])").ToLocalChecked()));
        return;
    }

    std::string problem = *String::Utf8Value(isolate, args[0]);
    std::string category = args.Length() > 1 ? *String::Utf8Value(isolate, args[1]) : "";

    auto result = obj->engine_->findSolution(problem, category);

    if (!result) {
        args.GetReturnValue().Set(v8::Null(isolate));
        return;
    }

    Local<Object> result_obj = Object::New(isolate);
    
    // Solution object
    Local<Object> solution_obj = Object::New(isolate);
    solution_obj->Set(context, String::NewFromUtf8(isolate, "content").ToLocalChecked(),
                     String::NewFromUtf8(isolate, result->solution.content.c_str()).ToLocalChecked()).FromJust();
    solution_obj->Set(context, String::NewFromUtf8(isolate, "created_date").ToLocalChecked(),
                     String::NewFromUtf8(isolate, result->solution.created_date.c_str()).ToLocalChecked()).FromJust();
    solution_obj->Set(context, String::NewFromUtf8(isolate, "use_count").ToLocalChecked(),
                     Number::New(isolate, result->solution.use_count)).FromJust();
    solution_obj->Set(context, String::NewFromUtf8(isolate, "source").ToLocalChecked(),
                     String::NewFromUtf8(isolate, result->solution.source.c_str()).ToLocalChecked()).FromJust();

    result_obj->Set(context, String::NewFromUtf8(isolate, "solution").ToLocalChecked(), solution_obj).FromJust();
    
    // Strategy enum to string
    std::string strategy_name;
    switch (result->strategy) {
        case brains::ConflictStrategy::RECENT_PROJECT_PRIORITY:
            strategy_name = "recent_project_priority";
            break;
        case brains::ConflictStrategy::NEWER_SOLUTION:
            strategy_name = "newer_solution";
            break;
        case brains::ConflictStrategy::POPULARITY_BASED:
            strategy_name = "popularity_based";
            break;
        case brains::ConflictStrategy::DEFAULT_LOCAL_PREFERENCE:
            strategy_name = "default_local_preference";
            break;
    }

    result_obj->Set(context, String::NewFromUtf8(isolate, "conflict_resolution").ToLocalChecked(),
                   String::NewFromUtf8(isolate, strategy_name.c_str()).ToLocalChecked()).FromJust();
    result_obj->Set(context, String::NewFromUtf8(isolate, "reason").ToLocalChecked(),
                   String::NewFromUtf8(isolate, result->reason.c_str()).ToLocalChecked()).FromJust();

    args.GetReturnValue().Set(result_obj);
}

void MemoryEngineWrapper::CategorizeError(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();

    MemoryEngineWrapper* obj = ObjectWrap::Unwrap<MemoryEngineWrapper>(args.Holder());

    if (args.Length() < 1) {
        isolate->ThrowException(Exception::TypeError(
            String::NewFromUtf8(isolate, "Expected error message").ToLocalChecked()));
        return;
    }

    std::string error_message = *String::Utf8Value(isolate, args[0]);
    std::string category = obj->engine_->categorizeError(error_message);

    args.GetReturnValue().Set(String::NewFromUtf8(isolate, category.c_str()).ToLocalChecked());
}

void MemoryEngineWrapper::GetStatistics(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();

    MemoryEngineWrapper* obj = ObjectWrap::Unwrap<MemoryEngineWrapper>(args.Holder());
    std::string stats_json = obj->engine_->getStatistics();

    args.GetReturnValue().Set(String::NewFromUtf8(isolate, stats_json.c_str()).ToLocalChecked());
}

void MemoryEngineWrapper::Clear(const FunctionCallbackInfo<Value>& args) {
    MemoryEngineWrapper* obj = ObjectWrap::Unwrap<MemoryEngineWrapper>(args.Holder());
    obj->engine_->clear();
}

void MemoryEngineWrapper::LoadSolutions(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    Local<Context> context = isolate->GetCurrentContext();

    MemoryEngineWrapper* obj = ObjectWrap::Unwrap<MemoryEngineWrapper>(args.Holder());

    if (args.Length() < 2) {
        isolate->ThrowException(Exception::TypeError(
            String::NewFromUtf8(isolate, "Expected (category, solutions[, isGlobal])").ToLocalChecked()));
        return;
    }

    std::string category = *String::Utf8Value(isolate, args[0]);
    bool is_global = args.Length() > 2 ? args[2]->BooleanValue(isolate) : false;

    if (!args[1]->IsObject()) {
        isolate->ThrowException(Exception::TypeError(
            String::NewFromUtf8(isolate, "Solutions must be an object").ToLocalChecked()));
        return;
    }

    Local<Object> solutions_obj = args[1]->ToObject(context).ToLocalChecked();
    Local<Array> problem_keys = solutions_obj->GetPropertyNames(context).ToLocalChecked();

    std::unordered_map<std::string, brains::Solution> solutions;

    for (uint32_t i = 0; i < problem_keys->Length(); i++) {
        Local<Value> key = problem_keys->Get(context, i).ToLocalChecked();
        Local<Value> value = solutions_obj->Get(context, key).ToLocalChecked();

        if (!key->IsString() || !value->IsString()) continue;

        std::string problem = *String::Utf8Value(isolate, key);
        std::string solution_content = *String::Utf8Value(isolate, value);

        solutions[problem] = brains::Solution(solution_content, is_global ? "global" : "project");
    }

    obj->engine_->loadSolutions(category, solutions, is_global);
}

// EnhancedMemoryEngineWrapper Implementation
Persistent<Function> EnhancedMemoryEngineWrapper::constructor;

EnhancedMemoryEngineWrapper::EnhancedMemoryEngineWrapper() {
    engine_ = new brains::EnhancedMemoryEngine();
}

EnhancedMemoryEngineWrapper::~EnhancedMemoryEngineWrapper() {
    delete engine_;
}

void EnhancedMemoryEngineWrapper::Init(Local<Object> exports) {
    Isolate* isolate = exports->GetIsolate();
    Local<Context> context = isolate->GetCurrentContext();

    Local<FunctionTemplate> tpl = FunctionTemplate::New(isolate, New);
    tpl->SetClassName(String::NewFromUtf8(isolate, "EnhancedMemoryEngine").ToLocalChecked());
    tpl->InstanceTemplate()->SetInternalFieldCount(1);

    NODE_SET_PROTOTYPE_METHOD(tpl, "initialize", Initialize);
    NODE_SET_PROTOTYPE_METHOD(tpl, "storeSolution", StoreSolution);
    NODE_SET_PROTOTYPE_METHOD(tpl, "findSolution", FindSolution);
    NODE_SET_PROTOTYPE_METHOD(tpl, "findRankedSolutions", FindRankedSolutions);
    NODE_SET_PROTOTYPE_METHOD(tpl, "getSuggestions", GetSuggestions);
    NODE_SET_PROTOTYPE_METHOD(tpl, "categorizeError", CategorizeError);
    NODE_SET_PROTOTYPE_METHOD(tpl, "getStatistics", GetStatistics);
    NODE_SET_PROTOTYPE_METHOD(tpl, "clear", Clear);

    Local<Function> constructor_func = tpl->GetFunction(context).ToLocalChecked();
    constructor.Reset(isolate, constructor_func);
    exports->Set(context, String::NewFromUtf8(isolate, "EnhancedMemoryEngine").ToLocalChecked(), constructor_func).FromJust();
}

void EnhancedMemoryEngineWrapper::New(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();

    if (args.IsConstructCall()) {
        EnhancedMemoryEngineWrapper* obj = new EnhancedMemoryEngineWrapper();
        obj->Wrap(args.This());
        args.GetReturnValue().Set(args.This());
    } else {
        const int argc = 1;
        Local<Value> argv[argc] = { args[0] };
        Local<Function> cons = Local<Function>::New(isolate, constructor);
        Local<Object> result = cons->NewInstance(isolate->GetCurrentContext(), argc, argv).ToLocalChecked();
        args.GetReturnValue().Set(result);
    }
}

void EnhancedMemoryEngineWrapper::Initialize(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    Local<Context> context = isolate->GetCurrentContext();
    EnhancedMemoryEngineWrapper* obj = ObjectWrap::Unwrap<EnhancedMemoryEngineWrapper>(args.Holder());

    if (args.Length() < 1 || !args[0]->IsObject()) {
        isolate->ThrowException(Exception::TypeError(
            String::NewFromUtf8(isolate, "Categories object required").ToLocalChecked()));
        return;
    }

    Local<Object> categories_obj = args[0]->ToObject(context).ToLocalChecked();
    Local<Array> category_keys = categories_obj->GetPropertyNames(context).ToLocalChecked();

    std::unordered_map<std::string, std::vector<std::string>> categories;

    for (uint32_t i = 0; i < category_keys->Length(); i++) {
        Local<Value> key = category_keys->Get(context, i).ToLocalChecked();
        Local<Value> value = categories_obj->Get(context, key).ToLocalChecked();

        if (!key->IsString()) continue;

        std::string category_name = *String::Utf8Value(isolate, key);
        std::vector<std::string> patterns;

        if (value->IsArray()) {
            Local<Array> patterns_array = Local<Array>::Cast(value);
            for (uint32_t j = 0; j < patterns_array->Length(); j++) {
                Local<Value> pattern = patterns_array->Get(context, j).ToLocalChecked();
                if (pattern->IsString()) {
                    patterns.push_back(*String::Utf8Value(isolate, pattern));
                }
            }
        }

        categories[category_name] = patterns;
    }

    bool success = obj->engine_->initialize(categories);
    args.GetReturnValue().Set(Boolean::New(isolate, success));
}

void EnhancedMemoryEngineWrapper::FindRankedSolutions(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    Local<Context> context = isolate->GetCurrentContext();
    EnhancedMemoryEngineWrapper* obj = ObjectWrap::Unwrap<EnhancedMemoryEngineWrapper>(args.Holder());

    if (args.Length() < 1 || !args[0]->IsString()) {
        isolate->ThrowException(Exception::TypeError(
            String::NewFromUtf8(isolate, "Problem string required").ToLocalChecked()));
        return;
    }

    std::string problem = *String::Utf8Value(isolate, args[0]);
    std::string category = args.Length() > 1 && args[1]->IsString() ? 
                          *String::Utf8Value(isolate, args[1]) : "";
    int max_suggestions = args.Length() > 2 && args[2]->IsNumber() ? 
                         args[2]->Int32Value(context).FromJust() : 5;

    auto ranked_solutions = obj->engine_->findRankedSolutions(problem, category, max_suggestions);

    Local<Array> result_array = Array::New(isolate, ranked_solutions.size());
    for (size_t i = 0; i < ranked_solutions.size(); i++) {
        const auto& [conflict_result, score] = ranked_solutions[i];
        
        Local<Object> result_obj = Object::New(isolate);
        Local<Object> solution_obj = Object::New(isolate);
        
        solution_obj->Set(context, String::NewFromUtf8(isolate, "content").ToLocalChecked(),
                         String::NewFromUtf8(isolate, conflict_result.solution.content.c_str()).ToLocalChecked()).FromJust();
        solution_obj->Set(context, String::NewFromUtf8(isolate, "source").ToLocalChecked(),
                         String::NewFromUtf8(isolate, conflict_result.solution.source.c_str()).ToLocalChecked()).FromJust();
        solution_obj->Set(context, String::NewFromUtf8(isolate, "use_count").ToLocalChecked(),
                         Number::New(isolate, conflict_result.solution.use_count)).FromJust();
        
        result_obj->Set(context, String::NewFromUtf8(isolate, "solution").ToLocalChecked(), solution_obj).FromJust();
        result_obj->Set(context, String::NewFromUtf8(isolate, "score").ToLocalChecked(),
                       Number::New(isolate, score)).FromJust();
        
        result_array->Set(context, i, result_obj).FromJust();
    }

    args.GetReturnValue().Set(result_array);
}

void EnhancedMemoryEngineWrapper::GetSuggestions(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    EnhancedMemoryEngineWrapper* obj = ObjectWrap::Unwrap<EnhancedMemoryEngineWrapper>(args.Holder());

    if (args.Length() < 1 || !args[0]->IsString()) {
        isolate->ThrowException(Exception::TypeError(
            String::NewFromUtf8(isolate, "Problem string required").ToLocalChecked()));
        return;
    }

    std::string problem = *String::Utf8Value(isolate, args[0]);
    std::string context = args.Length() > 1 && args[1]->IsString() ? 
                         *String::Utf8Value(isolate, args[1]) : "";

    std::string suggestions_json = obj->engine_->getSuggestions(problem, context);
    
    args.GetReturnValue().Set(String::NewFromUtf8(isolate, suggestions_json.c_str()).ToLocalChecked());
}

// Use delegation pattern for common methods
void EnhancedMemoryEngineWrapper::StoreSolution(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    EnhancedMemoryEngineWrapper* obj = ObjectWrap::Unwrap<EnhancedMemoryEngineWrapper>(args.Holder());

    if (args.Length() < 3) {
        isolate->ThrowException(Exception::TypeError(
            String::NewFromUtf8(isolate, "Problem, category, and solution required").ToLocalChecked()));
        return;
    }

    std::string problem = *String::Utf8Value(isolate, args[0]);
    std::string category = *String::Utf8Value(isolate, args[1]);
    std::string solution = *String::Utf8Value(isolate, args[2]);
    bool is_global = args.Length() > 3 ? args[3]->BooleanValue(isolate) : false;

    bool success = obj->engine_->storeSolution(problem, category, solution, is_global);
    args.GetReturnValue().Set(Boolean::New(isolate, success));
}

void EnhancedMemoryEngineWrapper::FindSolution(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    Local<Context> context = isolate->GetCurrentContext();
    EnhancedMemoryEngineWrapper* obj = ObjectWrap::Unwrap<EnhancedMemoryEngineWrapper>(args.Holder());

    if (args.Length() < 1 || !args[0]->IsString()) {
        isolate->ThrowException(Exception::TypeError(
            String::NewFromUtf8(isolate, "Problem string required").ToLocalChecked()));
        return;
    }

    std::string problem = *String::Utf8Value(isolate, args[0]);
    std::string category = args.Length() > 1 && args[1]->IsString() ? 
                          *String::Utf8Value(isolate, args[1]) : "";

    auto result = obj->engine_->findSolution(problem, category);
    
    if (result) {
        Local<Object> result_obj = Object::New(isolate);
        Local<Object> solution_obj = Object::New(isolate);
        
        solution_obj->Set(context, String::NewFromUtf8(isolate, "content").ToLocalChecked(),
                         String::NewFromUtf8(isolate, result->solution.content.c_str()).ToLocalChecked()).FromJust();
        solution_obj->Set(context, String::NewFromUtf8(isolate, "source").ToLocalChecked(),
                         String::NewFromUtf8(isolate, result->solution.source.c_str()).ToLocalChecked()).FromJust();
        
        result_obj->Set(context, String::NewFromUtf8(isolate, "solution").ToLocalChecked(), solution_obj).FromJust();
        result_obj->Set(context, String::NewFromUtf8(isolate, "found").ToLocalChecked(),
                       Boolean::New(isolate, true)).FromJust();
        
        args.GetReturnValue().Set(result_obj);
    } else {
        Local<Object> result_obj = Object::New(isolate);
        result_obj->Set(context, String::NewFromUtf8(isolate, "found").ToLocalChecked(),
                       Boolean::New(isolate, false)).FromJust();
        args.GetReturnValue().Set(result_obj);
    }
}

void EnhancedMemoryEngineWrapper::CategorizeError(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    EnhancedMemoryEngineWrapper* obj = ObjectWrap::Unwrap<EnhancedMemoryEngineWrapper>(args.Holder());

    if (args.Length() < 1 || !args[0]->IsString()) {
        isolate->ThrowException(Exception::TypeError(
            String::NewFromUtf8(isolate, "Error message string required").ToLocalChecked()));
        return;
    }

    std::string error_message = *String::Utf8Value(isolate, args[0]);
    std::string category = obj->engine_->categorizeError(error_message);
    
    args.GetReturnValue().Set(String::NewFromUtf8(isolate, category.c_str()).ToLocalChecked());
}

void EnhancedMemoryEngineWrapper::GetStatistics(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    EnhancedMemoryEngineWrapper* obj = ObjectWrap::Unwrap<EnhancedMemoryEngineWrapper>(args.Holder());

    std::string stats_json = obj->engine_->getStatistics();
    args.GetReturnValue().Set(String::NewFromUtf8(isolate, stats_json.c_str()).ToLocalChecked());
}

void EnhancedMemoryEngineWrapper::Clear(const FunctionCallbackInfo<Value>& args) {
    EnhancedMemoryEngineWrapper* obj = ObjectWrap::Unwrap<EnhancedMemoryEngineWrapper>(args.Holder());
    obj->engine_->clear();
}

void InitAll(Local<Object> exports) {
    MemoryEngineWrapper::Init(exports);
    EnhancedMemoryEngineWrapper::Init(exports);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, InitAll)

} // namespace brains_addon