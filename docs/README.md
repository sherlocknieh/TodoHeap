# 项目文档

本项目的文档使用 [MkDocs](https://www.mkdocs.org/) 进行编写和管理。以下是一些相关信息：
- 文档目录: `docs/_content/`
- 主要文档文件: `docs/_content/index.md`
- 配置文件: `mkdocs.yml`
- 依赖文件: `docs/requirements.txt`

本地预览文档:
```bash
    cd docs
    uv sync
    uv run mkdocs serve
```
3. 预览地址: http://127.0.0.1:8000/