# Netlify 배포 (한글 UI / 영어 대화)

**중요:** Netlify Drop(드래그&드롭)만으로는 Functions가 동작하지 않습니다.  
Git 연결 또는 Netlify CLI 배포를 사용하세요.

## Git 연결
1. 이 폴더를 GitHub에 올립니다.
2. Netlify → Add new site → Import from Git
3. Site settings → Build & deploy → Environment → Environment variables
   - `OPENAI_API_KEY` = 여러분의 OpenAI 키
4. Deploy → 발급 URL 접속 → 시작 → 마이크 허용 → 테스트

## CLI 배포
```bash
npm i -g netlify-cli
netlify login
netlify init
netlify env:set OPENAI_API_KEY "sk-..."
netlify deploy --build --prod
```

## 파일 구조
- `index.html` : 한글 UI (대화 음성은 영어)
- `netlify/functions/chat.js` : OpenAI 호출 (경로: `/.netlify/functions/chat`)
- `netlify.toml` : Functions 폴더 위치 설정

HTTPS에서 테스트해 주세요(마이크 권한). Safari/Chrome은 각각 Samantha/Google US English를 기본 사용합니다.
