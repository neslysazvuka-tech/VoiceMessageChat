// Ваша конфигурация Firebase
const firebaseConfig = {
    apiKey: "AIzaSyB2WvLmjgcv1YDwLRsVj6qAwbjMqG1hbKY",
    authDomain: "bindr-cac29.firebaseapp.com",
    databaseURL: "https://bindr-cac29-default-rtdb.firebaseio.com",
    projectId: "bindr-cac29",
    storageBucket: "bindr-cac29.firebasestorage.app",
    messagingSenderId: "888959223947",
    appId: "1:888959223947:web:c7e829c917354c9594ac8e"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const storage = firebase.storage();

// Элементы DOM
const usernameInput = document.getElementById('username-input');
const userAvatar = document.getElementById('user-avatar');
const recordBtn = document.getElementById('record-btn');
const timer = document.getElementById('timer');
const messagesContainer = document.getElementById('messages-container');
const noMessages = document.getElementById('no-messages');

// Переменные состояния
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let countdown;
let timeLeft = 35;
let currentUsername = '';
let userId = generateUserId();
let lastActivityTime = Date.now();

// Генерация уникального ID пользователя
function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

// Обновление времени последней активности
function updateLastActivity() {
    lastActivityTime = Date.now();
    if (currentUsername) {
        database.ref('users/' + userId).set({
            username: currentUsername,
            lastActivity: lastActivityTime
        }).catch(error => {
            console.error('Ошибка обновления активности:', error);
        });
    }
}

// Установка имени пользователя
usernameInput.addEventListener('change', () => {
    const username = usernameInput.value.trim();
    if (username) {
        currentUsername = username;
        userAvatar.textContent = username.charAt(0).toUpperCase();
        updateLastActivity();
        
        // Периодическая проверка активности пользователей
        setInterval(() => {
            database.ref('users').once('value', (snapshot) => {
                const users = snapshot.val();
                const now = Date.now();
                
                if (users) {
                    for (let id in users) {
                        if (now - users[id].lastActivity > 7 * 60 * 1000) {
                            database.ref('users/' + id).remove();
                        }
                    }
                }
            });
        }, 60000);
    }
});

// Запись аудио
recordBtn.addEventListener('click', async () => {
    if (!currentUsername) {
        alert('Пожалуйста, введите имя пользователя');
        return;
    }
    
    if (!isRecording) {
        try {
            // Запрос разрешения на использование микрофона
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });
            
            // Создание MediaRecorder с настройками
            const options = { 
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128000
            };
            
            mediaRecorder = new MediaRecorder(stream, options);
            audioChunks = [];
            
            // Обработка данных записи
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
            // Окончание записи
            mediaRecorder.onstop = async () => {
                try {
                    // Создание Blob из записанных данных
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    
                    // Проверка размера файла
                    if (audioBlob.size === 0) {
                        throw new Error('Запись пуста');
                    }
                    
                    // Генерация имени файла
                    const timestamp = Date.now();
                    const audioFileName = `audio_${userId}_${timestamp}.webm`;
                    
                    // Загрузка в Firebase Storage
                    const audioRef = storage.ref().child(audioFileName);
                    const snapshot = await audioRef.put(audioBlob);
                    
                    // Получение URL аудио
                    const audioURL = await audioRef.getDownloadURL();
                    
                    // Сохранение информации о сообщении в базе данных
                    await database.ref('messages').push({
                        userId: userId,
                        username: currentUsername,
                        audioURL: audioURL,
                        timestamp: timestamp
                    });
                    
                    console.log('Аудио успешно загружено:', audioURL);
                    
                } catch (error) {
                    console.error('Ошибка при обработке записи:', error);
                    alert('Ошибка при обработке записи: ' + error.message);
                } finally {
                    // Освобождение ресурсов микрофона
                    stream.getTracks().forEach(track => track.stop());
                }
            };
            
            // Обработка ошибок записи
            mediaRecorder.onerror = (event) => {
                console.error('Ошибка записи:', event.error);
                alert('Ошибка записи: ' + event.error.name);
                stopRecording();
            };
            
            // Начало записи
            mediaRecorder.start(1000); // Захват данных каждую секунду
            isRecording = true;
            recordBtn.classList.add('recording');
            
            // Запуск таймера
            timeLeft = 35;
            updateTimer();
            countdown = setInterval(() => {
                timeLeft--;
                updateTimer();
                
                if (timeLeft <= 0) {
                    stopRecording();
                }
            }, 1000);
            
        } catch (error) {
            console.error('Ошибка доступа к микрофону:', error);
            alert('Не удалось получить доступ к микрофону: ' + error.message);
        }
    } else {
        stopRecording();
    }
});

// Остановка записи
function stopRecording() {
    if (isRecording) {
        clearInterval(countdown);
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        isRecording = false;
        recordBtn.classList.remove('recording');
        timer.textContent = '00:35';
    }
}

// Обновление таймера
function updateTimer() {
    const seconds = timeLeft < 10 ? `0${timeLeft}` : timeLeft;
    timer.textContent = `00:${seconds}`;
}

// Загрузка существующих сообщений при загрузке страницы
function loadExistingMessages() {
    database.ref('messages').once('value', (snapshot) => {
        const messages = snapshot.val();
        if (messages && Object.keys(messages).length > 0) {
            noMessages.style.display = 'none';
            
            // Преобразуем объект в массив и сортируем по времени
            const messagesArray = Object.entries(messages).map(([key, value]) => {
                return { id: key, ...value };
            }).sort((a, b) => a.timestamp - b.timestamp);
            
            // Отображаем каждое сообщение
            messagesArray.forEach(message => {
                displayMessage(message);
            });
        } else {
            noMessages.style.display = 'block';
        }
    }).catch(error => {
        console.error('Ошибка загрузки сообщений:', error);
        noMessages.textContent = 'Ошибка загрузки сообщений';
    });
}

// Отображение сообщения
function displayMessage(message) {
    noMessages.style.display = 'none';
    
    // Проверка наличия необходимых данных
    if (!message.audioURL || !message.username) {
        console.error('Неполные данные сообщения:', message);
        return;
    }
    
    // Создание элемента сообщения
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.setAttribute('data-id', message.id);
    
    if (message.userId === userId) {
        messageElement.classList.add('own');
    }
    
    // Форматирование времени
    const messageTime = new Date(message.timestamp);
    const timeString = messageTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageElement.innerHTML = `
        <div class="message-avatar">${message.username.charAt(0).toUpperCase()}</div>
        <div class="message-content">
            <div class="message-username">${message.username}</div>
            <audio class="audio-player" controls>
                <source src="${message.audioURL}" type="audio/webm">
                Ваш браузер не поддерживает аудио элемент.
            </audio>
            <div class="message-time">${timeString}</div>
        </div>
    `;
    
    // Добавляем обработчик ошибок для аудио
    const audioElement = messageElement.querySelector('audio');
    audioElement.addEventListener('error', (e) => {
        console.error('Ошибка загрузки аудио:', e);
        audioElement.innerHTML = 'Ошибка загрузки аудио';
    });
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Слушатель для новых сообщений
database.ref('messages').on('child_added', (snapshot) => {
    try {
        const message = snapshot.val();
        message.id = snapshot.key;
        
        // Проверяем, что сообщение содержит все необходимые данные
        if (message.audioURL && message.username) {
            displayMessage(message);
            
            // Установка таймера для удаления сообщения через 3 минуты
            setTimeout(() => {
                // Удаление из базы данных
                snapshot.ref.remove().catch(error => {
                    console.error('Ошибка удаления сообщения:', error);
                });
                
                // Удаление из Storage
                if (message.audioURL) {
                    storage.refFromURL(message.audioURL).delete().catch(error => {
                        console.error('Ошибка удаления аудио:', error);
                    });
                }
            }, 3 * 60 * 1000);
        }
    } catch (error) {
        console.error('Ошибка обработки нового сообщения:', error);
    }
});

// Удаление сообщений из интерфейса при удалении из базы
database.ref('messages').on('child_removed', (snapshot) => {
    const messageId = snapshot.key;
    const messageElement = document.querySelector(`[data-id="${messageId}"]`);
    if (messageElement) {
        messageElement.remove();
    }
    
    // Показать "Нет сообщений", если все удалены
    if (messagesContainer.querySelectorAll('.message').length === 0) {
        noMessages.style.display = 'block';
    }
});

// Обновление активности при взаимодействии с интерфейсом
document.addEventListener('click', updateLastActivity);
document.addEventListener('keydown', updateLastActivity);

// Загрузка существующих сообщений при загрузке страницы
window.addEventListener('load', loadExistingMessages);

// Добавляем обработчик для проверки поддержки аудиоформатов
window.addEventListener('load', () => {
    const audio = document.createElement('audio');
    if (!audio.canPlayType('audio/webm')) {
        alert('Ваш браузер не поддерживает формат WebM. Пожалуйста, используйте современный браузер.');
    }
});
