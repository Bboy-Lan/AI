package authz.user

# Only anonymous visitors are affected. Existing authenticated users retain
# the platform defaults. Identity/auth endpoints are not covered by these rules.
allow if {
    input.subject.auth_type == "anonymous"
    input.cloudbase.resource_type == "functions"
    input.request.path in {"/v1/functions/lijin_feedback_v1", "/v1/functions/xsyj_web_v1"}
}

deny contains "访客无权调用此云函数" if {
    input.subject.auth_type == "anonymous"
    input.cloudbase.resource_type == "functions"
    not input.request.path in {"/v1/functions/lijin_feedback_v1", "/v1/functions/xsyj_web_v1"}
}

deny contains "访客无权使用此资源" if {
    input.subject.auth_type == "anonymous"
    input.cloudbase.resource_type in {"storages", "model", "rdb", "cloudrun", "ai", "aibot"}
}

# Email OTP was enabled only for an existing, pre-provisioned administrator.
# Block new HTTP API registrations; existing OTP sign-in uses token endpoints.
deny contains "此环境不开放自助注册" if {
    input.cloudbase.entrypoint_type == "tcbopenapi"
    input.subject.auth_type == "unauthenticated"
    input.request.path == "/auth/v1/signup"
    not xsyj_web_signup_origin
}


# User-authorized H5 registration source only. Lijin origin remains blocked.
xsyj_web_signup_origin if {
    input.request.header_map["Origin"] in {"https://cloud-ynnu-d6gs8ekf7dbcbe80e-1517920911.tcloudbaseapp.com", "https://bboy-lan.github.io"}
}

allow if {
    input.cloudbase.entrypoint_type == "tcbopenapi"
    input.subject.auth_type == "unauthenticated"
    input.request.path == "/auth/v1/signup"
    xsyj_web_signup_origin
}
