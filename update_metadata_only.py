import pandas as pd
from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv()

# Supabase 클라이언트 초기화
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 메타데이터 로드
print("Loading metadata...")
csv_path = "/Users/eomjoonseo/projects/dynplayer/contrastive_learning/contrastive_top1pct_basic_meta.csv"
metadata_df = pd.read_csv(csv_path)
print(f"Metadata: {len(metadata_df)} rows")

# metadata를 track_key로 매핑 (CSV에는 track_id 컬럼 사용)
metadata_dict = {}
for _, row in metadata_df.iterrows():
    metadata_dict[row['track_id']] = {
        'title': row['track'],
        'pos_count': int(row['pos_count'])
    }

print(f"Prepared {len(metadata_dict)} metadata records")

# Supabase에서 기존 track_key 가져오기
print("\nFetching existing track_keys from Supabase...")
page_size = 1000
offset = 0
all_track_keys = []

while True:
    response = supabase.table("track_keyword_embeddings").select("track_key").range(offset, offset + page_size - 1).execute()

    if not response.data:
        break

    all_track_keys.extend([item['track_key'] for item in response.data])
    print(f"  Fetched {len(all_track_keys)} track_keys so far...")

    if len(response.data) < page_size:
        break

    offset += page_size

print(f"✅ Total track_keys in Supabase: {len(all_track_keys)}")

# 메타데이터 업데이트 (UPDATE만 수행)
total_updated = 0
total_skipped = 0

print("\nUpdating metadata...")
for track_key in all_track_keys:
    meta = metadata_dict.get(track_key)

    if not meta:
        total_skipped += 1
        continue

    try:
        # UPDATE를 사용하여 title과 pos_count만 업데이트
        response = supabase.table("track_keyword_embeddings").update({
            "title": meta['title'],
            "pos_count": meta['pos_count']
        }).eq("track_key", track_key).execute()

        total_updated += 1

        if total_updated % 100 == 0:
            print(f"  Updated {total_updated} tracks so far... (Skipped: {total_skipped})")

    except Exception as e:
        print(f"❌ Error updating {track_key}: {e}")

print(f"\n🎉 Update complete!")
print(f"   Updated: {total_updated}")
print(f"   Skipped (no metadata): {total_skipped}")
print(f"   Total: {len(all_track_keys)}")
