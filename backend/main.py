
from dotenv import load_dotenv
import supabase
import os


# 导入环境变量
try:
    print("正在从系统环境变量中加载配置...")
    load_dotenv()

    SUPABASE_URL = os.getenv("PUBLIC_SUPABASE_URL")
    SUPABASE_KEY = os.getenv("PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    EMAIL = os.getenv("USER_EMAIL")
    PASSWORD = os.getenv("USER_PASSWORD")
except Exception as e:
    print(f"❌ 加载环境变量失败: {e}")
    print("请创建 .env 文件并按照 .env.example 填写环境变量")
    exit(1)

# 初始化 Supabase 客户端
supabase_client = supabase.create_client(SUPABASE_URL, SUPABASE_KEY)


# 用户登录测试
try:
    auth_response = supabase_client.auth.sign_in_with_password({
        "email": EMAIL,
        "password": PASSWORD
    })
    print("✅ 登录成功")
    print(f"响应: {auth_response}")
except Exception as e:
    print(f"❌ 登录失败: {e}")



# 数据库访问测试
try:
    # 查询 todos 表（测试数据库连接）
    response = supabase_client.table('todos').select('*').limit(1).execute()
    print("✅ Supabase 连接成功")
    print(f"响应: {response}")
except Exception as e:
    print(f"❌ Supabase 连接失败: {e}")



# 边缘函数调用测试
try:
    response = supabase_client.functions.invoke("hello",
    invoke_options={"body": {"name": "Functions"}})
    print("✅ 边缘函数调用成功")
    print(f"响应: {response}")
except Exception as e:
    print(f"❌ 边缘函数调用失败: {e}")