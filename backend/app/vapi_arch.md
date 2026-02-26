Your Browser                    VAPI Cloud Servers              Your Backend (localhost:8000)
     |                                |                                |
     |-- 1. vapi.start() ----------->|                                |
     |                                |                                |
     |-- 2. You speak -------------->|                                |
     |                                |-- 3. STT (speech→text)        |
     |                                |-- 4. Send text to GPT-4o-mini |
     |                                |-- 5. GPT calls search_knowledge|
     |                                |                                |
     |                                |-- 6. POST /vapi-chat -------->| ← THIS FAILS
     |                                |    (VAPI servers try to call   |    localhost is YOUR
     |                                |     YOUR serverUrl)            |    machine, not theirs
     |                                |                                |
     |                                |<-- 7. RAG results ------------|
     |                                |-- 8. GPT formulates reply     |
     |                                |-- 9. TTS (text→speech, 11labs)|
     |                                |                                |
     |<-- 10. Audio back to browser --|                                |