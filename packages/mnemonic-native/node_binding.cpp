#include <napi.h>
#include "domain_engine.h"
#include <memory>

using namespace brains;

class MemoryEngineWrapper : public Napi::ObjectWrap<MemoryEngineWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    MemoryEngineWrapper(const Napi::CallbackInfo& info);
    
private:
    static Napi::FunctionReference constructor;
    std::unique_ptr<MemoryApplicationService> service;
    
    // Domain operations
    Napi::Value Initialize(const Napi::CallbackInfo& info);
    Napi::Value CreateMemoryEntry(const Napi::CallbackInfo& info);
    Napi::Value UpdateMemoryEntry(const Napi::CallbackInfo& info);
    Napi::Value SearchMemories(const Napi::CallbackInfo& info);
    Napi::Value GetMemoryEntry(const Napi::CallbackInfo& info);
    Napi::Value GetStatistics(const Napi::CallbackInfo& info);
    
    // Compatibility with existing JS interface
    Napi::Value CategorizeError(const Napi::CallbackInfo& info);
    Napi::Value FindSolution(const Napi::CallbackInfo& info);
};

Napi::FunctionReference MemoryEngineWrapper::constructor;

Napi::Object MemoryEngineWrapper::Init(Napi::Env env, Napi::Object exports) {
    Napi::HandleScope scope(env);
    
    Napi::Function func = DefineClass(env, "BrainsMemoryEngine", {
        InstanceMethod("initialize", &MemoryEngineWrapper::Initialize),
        InstanceMethod("createMemoryEntry", &MemoryEngineWrapper::CreateMemoryEntry),
        InstanceMethod("updateMemoryEntry", &MemoryEngineWrapper::UpdateMemoryEntry),
        InstanceMethod("searchMemories", &MemoryEngineWrapper::SearchMemories),
        InstanceMethod("getMemoryEntry", &MemoryEngineWrapper::GetMemoryEntry),
        InstanceMethod("getStatistics", &MemoryEngineWrapper::GetStatistics),
        InstanceMethod("categorizeError", &MemoryEngineWrapper::CategorizeError),
        InstanceMethod("findSolution", &MemoryEngineWrapper::FindSolution)
    });
    
    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();
    
    exports.Set("BrainsMemoryEngine", func);
    return exports;
}

MemoryEngineWrapper::MemoryEngineWrapper(const Napi::CallbackInfo& info) 
    : Napi::ObjectWrap<MemoryEngineWrapper>(info) {
    service = std::make_unique<MemoryApplicationService>();
}

Napi::Value MemoryEngineWrapper::Initialize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Expected categories object").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    Napi::Object categories = info[0].As<Napi::Object>();
    std::unordered_map<std::string, std::vector<std::string>> category_map;
    
    Napi::Array category_names = categories.GetPropertyNames();
    for (uint32_t i = 0; i < category_names.Length(); i++) {
        Napi::String category = category_names.Get(i).As<Napi::String>();
        std::string category_str = category.Utf8Value();
        
        Napi::Value patterns_value = categories.Get(category);
        if (patterns_value.IsArray()) {
            Napi::Array patterns = patterns_value.As<Napi::Array>();
            std::vector<std::string> pattern_list;
            
            for (uint32_t j = 0; j < patterns.Length(); j++) {
                Napi::Value pattern = patterns.Get(j);
                if (pattern.IsString()) {
                    pattern_list.push_back(pattern.As<Napi::String>().Utf8Value());
                }
            }
            category_map[category_str] = pattern_list;
        } else if (patterns_value.IsString()) {
            category_map[category_str] = {patterns_value.As<Napi::String>().Utf8Value()};
        }
    }
    
    bool success = service->initialize(category_map);
    return Napi::Boolean::New(env, success);
}

Napi::Value MemoryEngineWrapper::CreateMemoryEntry(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 3) {
        Napi::TypeError::New(env, "Expected 3 arguments: problem, solution, category").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    std::string problem = info[0].As<Napi::String>().Utf8Value();
    std::string solution = info[1].As<Napi::String>().Utf8Value();
    std::string category = info[2].As<Napi::String>().Utf8Value();
    
    std::string entry_id = service->createMemoryEntry(problem, solution, category);
    return Napi::String::New(env, entry_id);
}

Napi::Value MemoryEngineWrapper::UpdateMemoryEntry(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 3) {
        Napi::TypeError::New(env, "Expected 3 arguments: entryId, newSolution, reason").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    std::string entry_id = info[0].As<Napi::String>().Utf8Value();
    std::string new_solution = info[1].As<Napi::String>().Utf8Value();
    std::string reason = info[2].As<Napi::String>().Utf8Value();
    
    bool success = service->updateMemoryEntry(entry_id, new_solution, reason);
    return Napi::Boolean::New(env, success);
}

Napi::Value MemoryEngineWrapper::SearchMemories(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Expected at least 1 argument: query").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    std::string query = info[0].As<Napi::String>().Utf8Value();
    std::string category = (info.Length() > 1 && info[1].IsString()) ? 
                          info[1].As<Napi::String>().Utf8Value() : "";
    int max_results = (info.Length() > 2 && info[2].IsNumber()) ? 
                     info[2].As<Napi::Number>().Int32Value() : 10;
    
    std::string results = service->searchMemories(query, category, max_results);
    return Napi::String::New(env, results);
}

Napi::Value MemoryEngineWrapper::GetMemoryEntry(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Expected entry ID").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    std::string entry_id = info[0].As<Napi::String>().Utf8Value();
    std::string entry_data = service->getMemoryEntry(entry_id);
    return Napi::String::New(env, entry_data);
}

Napi::Value MemoryEngineWrapper::GetStatistics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string stats = service->getStatistics();
    return Napi::String::New(env, stats);
}

// Compatibility methods for existing JS interface
Napi::Value MemoryEngineWrapper::CategorizeError(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Expected error message").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    std::string error_message = info[0].As<Napi::String>().Utf8Value();
    
    // Use a temporary basic engine for categorization
    // In production, this would be integrated with the domain engine
    DomainMemoryEngine temp_engine;
    std::unordered_map<std::string, std::vector<std::string>> default_categories = {
        {"authentication", {"(intent|callback).*oauth|auth.*fail|token.*invalid"}},
        {"networking", {"http.*timeout|connection.*refused|network.*error"}},
        {"database", {"(db|database).*(fail|connection)|sql.*error"}},
        {"filesystem", {"file.*not.*found|permission.*denied|disk.*full"}},
        {"memory", {"out.*of.*memory|memory.*leak|allocation.*failed"}},
        {"configuration", {"config.*invalid|missing.*env|property.*undefined"}}
    };
    temp_engine.initializeDomain(default_categories);
    
    std::string category = temp_engine.categorizeError(error_message);
    return Napi::String::New(env, category);
}

Napi::Value MemoryEngineWrapper::FindSolution(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Expected problem description").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    std::string problem = info[0].As<Napi::String>().Utf8Value();
    std::string category = (info.Length() > 1 && info[1].IsString()) ? 
                          info[1].As<Napi::String>().Utf8Value() : "";
    
    std::string results = service->searchMemories(problem, category, 1);
    return Napi::String::New(env, results);
}

// Module initialization
Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    return MemoryEngineWrapper::Init(env, exports);
}

NODE_API_MODULE(brains_memory_engine, InitAll)