from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("Checking metadata update progress...\n")

# title이 NULL이 아닌 레코드 개수
response = supabase.table("track_keyword_embeddings").select("track_key", count="exact").not_.is_("title", "null").execute()
updated_count = response.count

# 전체 레코드 개수
total_response = supabase.table("track_keyword_embeddings").select("track_key", count="exact").execute()
total_count = total_response.count

print(f"✅ Updated (title not null): {updated_count:,}")
print(f"📊 Total records: {total_count:,}")
print(f"📈 Progress: {updated_count / total_count * 100:.1f}%")
print(f"⏳ Remaining: {total_count - updated_count:,}")
