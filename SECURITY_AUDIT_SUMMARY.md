# 安全审计摘要 / Security Audit Summary

## 🔒 审计结论 / Audit Conclusion

✅ **安全 / SAFE** - 未发现后门或数据泄露 / No backdoors or data leaks found

---

## 📋 快速总结 / Quick Summary

### 中文

**Netcatty 是否安全？**

是的，经过全面源码审计，Netcatty **不会**：
- ❌ 向开发者服务器发送任何数据
- ❌ 收集用户使用情况统计
- ❌ 泄露 SSH 密码、密钥或会话内容
- ❌ 包含任何后门代码

Netcatty **仅会**：
- ✅ 在用户明确配置后，连接到用户选择的云服务（GitHub/Google/OneDrive/WebDAV/S3）
- ✅ 传输端到端加密的配置备份（使用用户主密码加密）
- ✅ 连接到用户配置的 SSH 服务器

### English

**Is Netcatty Safe?**

Yes, after a comprehensive source code audit, Netcatty does **NOT**:
- ❌ Send any data to developer servers
- ❌ Collect user usage statistics
- ❌ Leak SSH passwords, keys, or session content
- ❌ Contain any backdoor code

Netcatty **ONLY**:
- ✅ Connects to user-chosen cloud services (GitHub/Google/OneDrive/WebDAV/S3) after explicit user configuration
- ✅ Transmits end-to-end encrypted configuration backups (encrypted with user master password)
- ✅ Connects to user-configured SSH servers

---

## 🔍 详细报告 / Detailed Reports

- [完整中文审计报告 / Full Chinese Report](./SECURITY_AUDIT.zh-CN.md)
- [Full English Audit Report](./SECURITY_AUDIT.md)

---

## 🌐 外部连接清单 / External Connections List

### 用户主动配置的云同步 / User-Configured Cloud Sync

仅在用户设置后才会连接 / Only connects after user setup:

| 服务 / Service | 用途 / Purpose | 数据加密 / Encryption |
|----------------|----------------|----------------------|
| GitHub Gist | 云备份 / Cloud backup | ✅ 端到端加密 / E2E |
| Google Drive | 云备份 / Cloud backup | ✅ 端到端加密 / E2E |
| OneDrive | 云备份 / Cloud backup | ✅ 端到端加密 / E2E |
| WebDAV | 自建服务器 / Self-hosted | ✅ 端到端加密 / E2E |
| S3 | 对象存储 / Object storage | ✅ 端到端加密 / E2E |

### 用户配置的 SSH 连接 / User-Configured SSH

- 您配置的 SSH 服务器 / Your configured SSH servers

### 无其他连接 / No Other Connections

- ❌ 无分析追踪 / No analytics
- ❌ 无错误报告 / No error reporting  
- ❌ 无版本检查 / No version check
- ❌ 无广告服务器 / No ad servers

---

## 🛡️ 隐私保护措施 / Privacy Protection

1. **端到端加密 / End-to-End Encryption**
   - 所有云同步数据使用 AES-256-GCM 加密
   - All cloud sync data encrypted with AES-256-GCM

2. **主密码保护 / Master Password Protection**
   - 主密码仅存储在内存中，从不写入磁盘
   - Master password stored only in memory, never written to disk

3. **可选云同步 / Optional Cloud Sync**
   - 云同步完全可选，可禁用
   - Cloud sync is completely optional and can be disabled

4. **本地优先 / Local-First**
   - 所有数据默认本地存储
   - All data stored locally by default

---

## ✅ 推荐使用场景 / Recommended Use Cases

Netcatty 适合以下用户 / Netcatty is suitable for:

- ✅ 需要管理多台 SSH 服务器的开发者
  / Developers managing multiple SSH servers
- ✅ 重视隐私和数据安全的用户
  / Users who value privacy and data security
- ✅ 需要跨设备同步配置的用户（可选）
  / Users who need cross-device config sync (optional)
- ✅ 企业内部部署场景
  / Enterprise internal deployment scenarios

---

## 📅 审计日期 / Audit Date

2026-01-03

## 👤 审计人员 / Auditor

GitHub Copilot Coding Agent

---

## 📝 注意事项 / Notes

1. 本审计基于源代码分析，未包含运行时动态分析
   / This audit is based on source code analysis, not runtime dynamic analysis

2. 建议用户从官方仓库获取代码并自行编译
   / Users are advised to obtain code from official repository and compile themselves

3. 如发现安全问题，请通过 GitHub Issues 报告
   / If security issues are found, please report via GitHub Issues

---

## 📄 许可证 / License

GPL-3.0-or-later
