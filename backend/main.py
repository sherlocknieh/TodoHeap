
from dotenv import load_dotenv
import supabase
import os


# 导入环境变量
load_dotenv()


# 初始化 Supabase 客户端
SUPABASE_URL = os.getenv("PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("PUBLIC_SUPABASE_PUBLISHABLE_KEY")
supabase_client = supabase.create_client(SUPABASE_URL, SUPABASE_KEY)

EMAIL = os.getenv("USER_EMAIL")
PASSWORD = os.getenv("USER_PASSWORD")

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
    response = supabase_client.functions.invoke("hello-world",
    invoke_options={"body": {"name": "Functions"}})
    print("✅ 边缘函数调用成功")
    print(f"响应: {response}")
except Exception as e:
    print(f"❌ 边缘函数调用失败: {e}")