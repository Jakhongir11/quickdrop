# QuickDrop
Передача файлов между устройствами по WebRTC. Сервер только сигнализирует, файлы идут напрямую.

Запуск локально: `npm install && npm start`, затем http://localhost:3000
(WebRTC на других устройствах требует HTTPS: используйте хостинг).

Необязательный TURN (если сеть блокирует прямое соединение), переменные окружения:
TURN_URL (например turn:global.relay.metered.ca:80,turns:global.relay.metered.ca:443?transport=tcp), TURN_USER, TURN_PASS
