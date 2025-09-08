import pandas as pd
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from flask import Flask, request, jsonify
import sys
import json

class SongRecommender:
    def __init__(self, meta_csv_path, embeddings_path):
        print("Loading recommendation data...")
        self.meta_df = pd.read_csv(meta_csv_path)
        self.embeddings = np.load(embeddings_path)

        # track_id를 인덱스로 매핑하는 딕셔너리 생성 (meta_df에서 직접)
        self.track_id_to_idx = {track_id: idx for idx, track_id in enumerate(self.meta_df['track_id'])}
        print(f"Loaded {len(self.meta_df)} songs for recommendations")

    def find_track_id_by_title(self, song_title, artist_name=None):
        """노래 제목으로 track_id를 찾는 함수"""
        # 대소문자 무시하고 부분 일치 검색
        matches = self.meta_df[
            self.meta_df["track"].str.contains(song_title, case=False, na=False)
        ]

        # 아티스트 이름도 제공된 경우 추가 필터링
        if artist_name:
            matches = matches[
                matches["artist"].str.contains(artist_name, case=False, na=False)
            ]

        if len(matches) == 0:
            return None, []
        elif len(matches) == 1:
            match = matches.iloc[0]
            return match["track_id"], [{
                "track_id": match["track_id"],
                "track": match["track"],
                "artist": match["artist"],
                "album": match["album"]
            }]
        else:
            # 여러 개 일치하는 경우 정확한 일치를 찾거나 모든 결과 반환
            exact_match = matches[matches["track"].str.lower() == song_title.lower()]
            
            all_matches = []
            for _, row in matches.iterrows():
                all_matches.append({
                    "track_id": row["track_id"],
                    "track": row["track"],
                    "artist": row["artist"],
                    "album": row["album"]
                })
            
            if len(exact_match) > 0:
                return exact_match.iloc[0]["track_id"], all_matches
            else:
                return matches.iloc[0]["track_id"], all_matches

    def get_similar_songs(self, track_id, num_recommendations=20):
        """주어진 track_id와 유사한 노래들을 찾는 함수"""
        if track_id not in self.track_id_to_idx:
            return None

        # 해당 track의 임베딩 인덱스 찾기
        target_idx = self.track_id_to_idx[track_id]
        target_embedding = self.embeddings[target_idx].reshape(1, -1)

        # 모든 임베딩과의 코사인 유사도 계산
        similarities = cosine_similarity(target_embedding, self.embeddings)[0]

        # 자기 자신을 제외하고 가장 유사한 노래들의 인덱스 찾기
        similar_indices = np.argsort(similarities)[::-1][1 : num_recommendations + 1]

        # 추천 노래 정보 수집
        recommendations = []
        for idx in similar_indices:
            track_info = self.meta_df.iloc[idx]  # 직접 인덱스로 접근
            recommendations.append(
                {
                    "track_id": track_info["track_id"],
                    "track": track_info["track"],
                    "artist": track_info["artist"],
                    "album": track_info["album"],
                    "similarity": float(similarities[idx]),
                    "pos_count": int(track_info["pos_count"])
                }
            )

        # Log similar recommendations with similarity scores
        if recommendations:
            current_track_info = self.meta_df[self.meta_df['track_id'] == track_id].iloc[0]
            print(f"\n🎵 SIMILAR RECOMMENDATIONS (High Similarity):")
            print(f"📍 Current track: {current_track_info['track']} - {current_track_info['artist']}")
            print(f"🎯 Found {len(recommendations)} similar tracks:")
            for i, rec in enumerate(recommendations[:5], 1):  # Show top 5
                similarity_pct = rec['similarity'] * 100
                print(f"  {i:2d}. {rec['track']:<35} - {rec['artist']:<25} ({similarity_pct:5.1f}% similar, 🔥{rec['pos_count']:>4} plays)")
            if len(recommendations) > 5:
                print(f"  ... and {len(recommendations) - 5} more tracks")
            print("")

        return recommendations

    def recommend_songs(self, song_title, artist_name=None, num_recommendations=10):
        """노래 제목을 입력받아 추천 노래 리스트를 반환하는 메인 함수"""
        # 1. 노래 제목으로 track_id 찾기
        track_id, matches = self.find_track_id_by_title(song_title, artist_name)

        if track_id is None:
            return {
                "error": f"'{song_title}'와 일치하는 노래를 찾을 수 없습니다.",
                "matches": []
            }

        # 원곡 정보
        original_song = self.meta_df[self.meta_df["track_id"] == track_id].iloc[0]

        # 2. 유사한 노래들 찾기
        recommendations = self.get_similar_songs(track_id, num_recommendations)

        if recommendations is None:
            return {
                "error": "해당 노래의 임베딩을 찾을 수 없습니다.",
                "matches": matches
            }

        return {
            "original_song": {
                "track_id": track_id,
                "track": original_song["track"],
                "artist": original_song["artist"],
                "album": original_song["album"]
            },
            "recommendations": recommendations,
            "matches": matches if len(matches) > 1 else []
        }

    def get_diverse_recommendations(self, current_track_id, num_recommendations=10):
        """
        현재 곡과 거리가 먼 곡들 중 pos_count가 높은 곡들을 추천
        """
        if current_track_id not in self.track_id_to_idx:
            return []
        
        current_idx = self.track_id_to_idx[current_track_id]
        current_embedding = self.embeddings[current_idx].reshape(1, -1)
        
        # 모든 곡과의 유사도 계산
        similarities = cosine_similarity(current_embedding, self.embeddings)[0]
        
        # 유사도가 낮은 순으로 정렬 (거리가 먼 곡들)
        distant_indices = np.argsort(similarities)
        
        # 하위 50% 중에서 pos_count가 높은 곡들 선택
        bottom_half_count = len(distant_indices) // 2
        bottom_half_indices = distant_indices[:bottom_half_count]
        
        # 해당 곡들의 pos_count 정보 수집
        diverse_candidates = []
        for idx in bottom_half_indices:
            track_info = self.meta_df.iloc[idx]  # 직접 인덱스로 접근
            diverse_candidates.append({
                "idx": idx,
                "track_id": track_info["track_id"],
                "track": track_info["track"],
                "artist": track_info["artist"],
                "album": track_info["album"],
                "pos_count": int(track_info["pos_count"]),
                "similarity": float(similarities[idx])
            })
        
        # pos_count로 정렬하고 상위 곡들 선택
        diverse_candidates.sort(key=lambda x: x["pos_count"], reverse=True)
        
        recommendations = []
        for candidate in diverse_candidates[:num_recommendations]:
            recommendations.append({
                "track_id": candidate["track_id"],
                "track": candidate["track"],
                "artist": candidate["artist"],
                "album": candidate["album"],
                "similarity": candidate["similarity"],
                "pos_count": int(candidate["pos_count"])
            })
        
        # Log diverse recommendations with similarity scores
        if recommendations:
            print(f"\n🔀 DIVERSE RECOMMENDATIONS (Low Similarity, High Popularity):")
            print(f"📍 Current track: {self.meta_df[self.meta_df['track_id'] == current_track_id].iloc[0]['track']}")
            print(f"🎯 Found {len(recommendations)} distant tracks sorted by popularity:")
            for i, rec in enumerate(recommendations, 1):
                similarity_pct = rec['similarity'] * 100
                print(f"  {i:2d}. {rec['track']:<35} - {rec['artist']:<25} ({similarity_pct:5.1f}% similar, 🔥{rec['pos_count']:>4} plays)")
            print("")
        
        return recommendations

# Flask 앱 생성
app = Flask(__name__)
recommender = None

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy"})

@app.route('/recommend', methods=['POST'])
def recommend():
    try:
        data = request.get_json()
        song_title = data.get('song_title', '').strip()
        artist_name = data.get('artist_name', '').strip() if data.get('artist_name') else None
        num_recommendations = data.get('num_recommendations', 10)

        if not song_title:
            return jsonify({"error": "노래 제목을 입력해주세요."}), 400

        result = recommender.recommend_songs(song_title, artist_name, num_recommendations)
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": f"추천 처리 중 오류가 발생했습니다: {str(e)}"}), 500

@app.route('/search', methods=['POST'])
def search():
    try:
        data = request.get_json()
        query = data.get('query', '').strip()

        if not query:
            return jsonify({"error": "검색어를 입력해주세요."}), 400

        # 제목과 아티스트에서 검색
        title_matches = recommender.meta_df[
            recommender.meta_df["track"].str.contains(query, case=False, na=False)
        ]
        artist_matches = recommender.meta_df[
            recommender.meta_df["artist"].str.contains(query, case=False, na=False)
        ]

        # 결합하고 중복 제거
        all_matches = pd.concat([title_matches, artist_matches]).drop_duplicates()
        
        # 상위 20개만 반환
        results = []
        for _, row in all_matches.head(20).iterrows():
            results.append({
                "track_id": row["track_id"],
                "track": row["track"],
                "artist": row["artist"],
                "album": row["album"]
            })

        return jsonify({"results": results})

    except Exception as e:
        return jsonify({"error": f"검색 처리 중 오류가 발생했습니다: {str(e)}"}), 500

@app.route('/recommend-diverse', methods=['POST'])
def recommend_diverse():
    try:
        print("🔀 DIVERSE ENDPOINT CALLED!")
        data = request.get_json()
        current_track_id = data.get('current_track_id')
        num_recommendations = data.get('num_recommendations', 10)
        
        print(f"🔀 Request data: track_id={current_track_id}, num_recommendations={num_recommendations}")
        
        if not current_track_id:
            return jsonify({"error": "현재 트랙 ID가 필요합니다."}), 400
        
        print(f"🔀 Calling get_diverse_recommendations...")
        recommendations = recommender.get_diverse_recommendations(current_track_id, num_recommendations)
        print(f"🔀 Got {len(recommendations) if recommendations else 0} diverse recommendations")
        
        if not recommendations:
            return jsonify({"error": "해당 곡의 다양한 추천을 찾을 수 없습니다."}), 404
        
        return jsonify({
            "recommendations": recommendations,
            "diverse_mode": True
        })
    
    except Exception as e:
        return jsonify({"error": f"다양한 추천 처리 중 오류가 발생했습니다: {str(e)}"}), 500

def init_recommender():
    global recommender
    recommender = SongRecommender(
        meta_csv_path="contrastive_top5pct_win_meta.csv",
        embeddings_path="contrastive_top5pct_win_embeddings.npy"
    )

if __name__ == '__main__':
    init_recommender()
    app.run(host='0.0.0.0', port=5001, debug=False)