import numpy as np
import pandas as pd
from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv()

# Supabase 클라이언트 초기화
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 데이터 로드
print("Loading data...")
track_ids = np.load("clip_title_track_ids_twostage.npy", allow_pickle=True)
embeddings = np.load("clip_title_track_projected_twostage.npy")
metadata_df = pd.read_csv("contrastive_learning/contrastive_top1pct_basic_meta.csv")

print(f"Track IDs: {len(track_ids)}")
print(f"Embeddings: {embeddings.shape}")
print(f"Metadata: {len(metadata_df)} rows")

# metadata를 track_key로 매핑
metadata_dict = {}
for _, row in metadata_df.iterrows():
    metadata_dict[row['track_key']] = {
        'track_name': row['title'],
        'pos_count': int(row['pos_count'])
    }

# 배치 업로드
batch_size = 1000
total_uploaded = 0
total_skipped = 0

for i in range(0, len(track_ids), batch_size):
    batch_ids = track_ids[i:i + batch_size]
    batch_embeddings = embeddings[i:i + batch_size]

    records = []
    for track_id, embedding in zip(batch_ids, batch_embeddings):
        track_id_str = str(track_id)

        # 메타데이터 찾기
        meta = metadata_dict.get(track_id_str, {})

        if not meta:
            print(f"⚠️ No metadata for {track_id_str}, skipping...")
            total_skipped += 1
            continue

        records.append({
            "track_key": track_id_str,
            "embedding": embedding.tolist(),
            "title": meta.get('track_name'),
            "pos_count": meta.get('pos_count')
        })

    if records:
        try:
            response = supabase.table("track_keyword_embeddings").upsert(
                records,
                on_conflict="track_key"
            ).execute()

            total_uploaded += len(records)
            print(f"✅ Batch {i // batch_size + 1}: Uploaded {len(records)} tracks (Total: {total_uploaded})")
        except Exception as e:
            print(f"❌ Error uploading batch {i // batch_size + 1}: {e}")

print(f"\n🎉 Upload complete!")
print(f"   Uploaded: {total_uploaded}")
print(f"   Skipped: {total_skipped}")
print(f"   Total: {len(track_ids)}")
