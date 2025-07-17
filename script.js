// Constants for configuration
const CONFIG = {
  UNSPLASH_API: {
    ACCESS_KEY: '___Key___', // You should ideally store this in Chrome storage
    QUERY: 'nature,landscape,coastal', //outdoor,scenery
    ORIENTATION: 'landscape',
    CACHE_DURATION: 1 * 60 * 60 * 1000, // 24 hours in milliseconds
  },
  WEATHER_API: {
    BASE_URL: 'https://api.openweathermap.org/data/2.5/weather',
    API_KEY: '___Key___', // You should ideally store this in Chrome storage
    UNITS: 'metric',
    CACHE_DURATION: 60 * 60 * 1000, // 1 hour in milliseconds
  },
  QUOTE_API: {
    URL: 'https://zenquotes.io/api/random',
    CACHE_DURATION: 1 * 60 * 60 * 1000, // 24 hours in milliseconds
  },
  UPDATE_INTERVALS: {
    TIME: 60 * 1000, // 1 minute in milliseconds
  },
  FAVORITES: {
    MAX_ITEMS: 20, // Maximum number of favorites to store
    MAX_QUOTES: 30, // Maximum number of favorite quotes to store
  },
};

// Utility Functions
const utils = {
  // Safely get data from storageS
  getFromStorage: (keys) => {
    return new Promise((resolve) => {
      chrome.storage.sync.get(keys, (result) => {
        resolve(result);
      });
    });
  },

  // Safely store data to storage
  saveToStorage: (data) => {
    return new Promise((resolve) => {
      chrome.storage.sync.set(data, resolve);
    });
  },

  // Safe DOM element creation with escaping for text content
  createSafeElement: (tag, attributes = {}, textContent = '') => {
    const element = document.createElement(tag);

    // Set attributes
    Object.entries(attributes).forEach(([key, value]) => {
      if (key === 'class' || key === 'className') {
        value.split(' ').forEach(cls => cls && element.classList.add(cls));
      } else {
        element.setAttribute(key, value);
      }
    });

    // Set text content safely (automatically escaped)
    if (textContent) {
      element.textContent = textContent;
    }

    return element;
  },

  // Safely fetch data with timeout and error handling
  fetchWithTimeout: async (url, options = {}, timeout = 10000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  // Sanitize strings for insertion into HTML
  sanitizeString: (str) => {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  }
};

// Background Image Module
const backgroundModule = (() => {
  let currentBackgroundData = null; // Store current background data

  async function setRandomBackground(isRefresh = false) {
    try {
      // Check cache first
      const { backgroundImage, backgroundTimestamp, backgroundData } = await utils.getFromStorage([
        'backgroundImage',
        'backgroundTimestamp', 
        'backgroundData'
      ]);

      const now = Date.now();
      
      // Store current background data
      currentBackgroundData = backgroundData;

      // Use cached image if available and not expired
      if (
        backgroundImage &&
        backgroundTimestamp &&
        (now - backgroundTimestamp < CONFIG.UNSPLASH_API.CACHE_DURATION) &&
        !isRefresh
      ) {
        setBackgroundImage(backgroundImage);
        updateFavoriteButton();
      } else {
        await fetchNewBackground();
      }
    } catch (error) {
      console.error('Error in background module:', error);
      document.body.style.backgroundColor = '#333';
    }
  }

  async function fetchNewBackground() {
    try {
      const { ACCESS_KEY, QUERY, ORIENTATION } = CONFIG.UNSPLASH_API;

      const data = await utils.fetchWithTimeout(
        `https://api.unsplash.com/photos/random?query=${QUERY}&orientation=${ORIENTATION}&client_id=${ACCESS_KEY}`
      );

      const imageUrl = data.urls.raw;
      // Store more data about the image
      const backgroundData = {
        id: data.id,
        url: imageUrl,
        thumbnailUrl: data.urls.thumb,
        date: new Date().toISOString(),
        description: data.description || data.alt_description || 'Beautiful background image',
        photographer: data.user.name,
        unsplashLink: data.links.html
      };

      currentBackgroundData = backgroundData;

      await utils.saveToStorage({
        backgroundImage: imageUrl,
        backgroundData: backgroundData,
        backgroundTimestamp: Date.now()
      });

      setBackgroundImage(imageUrl);
      updateFavoriteButton();
    } catch (error) {
      console.error('Error fetching background image:', error);
      document.body.style.backgroundColor = '#333';
    }
  }

  function setBackgroundImage(imageUrl) {
    if (!imageUrl) return;

    const img = new Image();

    img.onload = function () {
      document.body.style.backgroundImage = `url('${imageUrl}')`;
    };

    img.onerror = function () {
      console.error('Failed to load background image');
      document.body.style.backgroundColor = '#333';
    };

    // Start loading the image
    img.src = imageUrl;
  }

  // Method to get current background data
  function getCurrentBackgroundData() {
    if (!currentBackgroundData && document.body.style.backgroundImage) {
      // If we have a background image but no data, create a basic data object
      const imageUrl = document.body.style.backgroundImage.replace(/url\(['"](.+)['"]\)/, '$1');
      return {
        id: `fallback-${Date.now()}`, // Generate a unique ID
        url: imageUrl,
        thumbnailUrl: imageUrl,
        date: new Date().toISOString(),
        description: 'Background image',
      };
    }
    return currentBackgroundData;
  }

  // Method to set background from specific data
  function setBackgroundFromData(data) {
    if (!data || !data.url) return;

    // Update current data
    currentBackgroundData = data;
    
    // Set the background
    setBackgroundImage(data.url);
    
    // Update favorite button state
    updateFavoriteButton();
  }

  // Update favorite button state
  function updateFavoriteButton() {
    if (!currentBackgroundData) return;
  
    // Check if current background is in favorites
    favoritesModule.checkIsFavorite(currentBackgroundData.id)
      .then(isFavorite => {
        const favoriteBtn = document.getElementById('favorite-current-bg');
        if (favoriteBtn) {
          if (isFavorite) {
            favoriteBtn.classList.add('active');
          } else {
            favoriteBtn.classList.remove('active');
          }
        }
      });
  }

  return {
    setRandomBackground,
    getCurrentBackgroundData,
    setBackgroundFromData,
    updateFavoriteButton
  };
})();

// Clock Module
const clockModule = (() => {
  async function updateTime() {
    const now = new Date();
    const timeElement = document.getElementById('time');

    if (!timeElement) return;

    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');

    // Display time in 24-hour format
    timeElement.textContent = `${hours}:${minutes}`;

    // Update greeting based on time of day
    await updateGreeting(hours);
  }

  async function updateGreeting(hour) {
    const greeting = document.getElementById('greeting');
    if (!greeting) return;

    let greetingText = '';

    if (hour < 12) {
      greetingText = 'Good morning';
    } else if (hour < 18) {
      greetingText = 'Good afternoon';
    } else {
      greetingText = 'Good evening';
    }

    // Get user's name from storage
    const { name } = await utils.getFromStorage(['name']);

    if (name) {
      greetingText += `, ${name}`;
    }

    greeting.textContent = greetingText;
  }

  function setupNameListener() {
    const greeting = document.getElementById('greeting');

    if (!greeting) return;

    greeting.addEventListener('click', async function () {
      const { name } = await utils.getFromStorage(['name']);
      const currentName = name || '';

      // Use a more secure method than prompt in a real extension
      const newName = prompt('What is your name?', currentName);

      if (newName !== null) {
        await utils.saveToStorage({ 'name': newName });
        updateTime(); // Update greeting with new name
      }
    });
  }

  return {
    updateTime,
    setupNameListener
  };
})();

// Focus Module
const focusModule = (() => {
  function setupFocus() {
    const focusInput = document.getElementById('focus-input');
    const focusDisplay = document.getElementById('focus-display');
    const focusText = document.getElementById('focus-text');
    const focusCompleteBtn = document.getElementById('focus-complete-btn');

    if (!focusInput || !focusDisplay || !focusText || !focusCompleteBtn) return;

    // Load saved focus
    utils.getFromStorage(['focus', 'focusCompleted'])
      .then(result => {
        if (result.focus) {
          focusInput.classList.add('hidden');
          focusDisplay.classList.remove('hidden');
          focusText.textContent = utils.sanitizeString(result.focus);

          if (result.focusCompleted) {
            focusText.classList.add('completed');
          }
        }
      });

    // Save new focus
    focusInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter' && focusInput.value.trim() !== '') {
        const focus = focusInput.value.trim();

        utils.saveToStorage({
          'focus': focus,
          'focusCompleted': false
        }).then(() => {
          focusText.textContent = utils.sanitizeString(focus);
          focusText.classList.remove('completed');
          focusInput.classList.add('hidden');
          focusDisplay.classList.remove('hidden');
          focusInput.value = '';
        });
      }
    });

    // Toggle focus completion
    focusCompleteBtn.addEventListener('click', function () {
      const isCompleted = focusText.classList.contains('completed');
      focusText.classList.toggle('completed');
      utils.saveToStorage({ 'focusCompleted': !isCompleted });
    });

    // Allow editing focus
    focusText.addEventListener('click', function () {
      focusInput.value = focusText.textContent;
      focusDisplay.classList.add('hidden');
      focusInput.classList.remove('hidden');
      focusInput.focus();
    });
  }

  return {
    setupFocus
  };
})();

// Todo Module
const todoModule = (() => {
  function setupTodo() {
    const todoToggle = document.getElementById('todo-toggle');
    const todoForm = document.getElementById('todo-form');
    const todoInput = document.getElementById('todo-input');
    const todoList = document.getElementById('todo-list');

    if (!todoToggle || !todoForm || !todoInput || !todoList) return;

    // Toggle todo form
    todoToggle.addEventListener('click', function () {
      todoForm.classList.toggle('hidden');
      if (!todoForm.classList.contains('hidden')) {
        todoInput.focus();
      }
    });

    // Load saved todos
    loadTodos();

    // Add new todo
    todoInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter' && todoInput.value.trim() !== '') {
        addTodo(todoInput.value.trim());
        todoInput.value = '';
      }
    });

    async function loadTodos() {
      const { todos } = await utils.getFromStorage(['todos']);
      const todoItems = todos || [];

      todoList.innerHTML = '';

      todoItems.forEach(function (todo) {
        const todoItem = createTodoElement(todo);
        todoList.appendChild(todoItem);
      });
    }

    async function addTodo(text) {
      if (!text || typeof text !== 'string') return;

      // Limit todo text length for security
      const safeText = text.substring(0, 100);

      const todo = {
        id: Date.now(),
        text: safeText,
        completed: false
      };

      const { todos } = await utils.getFromStorage(['todos']);
      const todoItems = todos || [];
      todoItems.push(todo);

      await utils.saveToStorage({ 'todos': todoItems });

      const todoItem = createTodoElement(todo);
      todoList.appendChild(todoItem);
    }

    function createTodoElement(todo) {
      // Create todo item container
      const todoItem = utils.createSafeElement('div', {
        class: 'todo-item',
        'data-id': todo.id
      });

      // Create todo text element
      const todoText = utils.createSafeElement('div', {
        class: todo.completed ? 'todo-text completed' : 'todo-text'
      }, todo.text);

      // Create actions container
      const todoActions = utils.createSafeElement('div', {
        class: 'todo-actions'
      });

      // Create complete button
      const completeBtn = utils.createSafeElement('span');
      completeBtn.innerHTML = '<i class="fas fa-check"></i>';
      completeBtn.addEventListener('click', function () {
        toggleTodoComplete(todo.id);
      });

      // Create delete button
      const deleteBtn = utils.createSafeElement('span');
      deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
      deleteBtn.addEventListener('click', function () {
        deleteTodo(todo.id);
      });

      // Assemble todo item
      todoActions.appendChild(completeBtn);
      todoActions.appendChild(deleteBtn);
      todoItem.appendChild(todoText);
      todoItem.appendChild(todoActions);

      return todoItem;
    }

    async function toggleTodoComplete(id) {
      const { todos } = await utils.getFromStorage(['todos']);
      const todoItems = todos || [];
      const todoIndex = todoItems.findIndex(t => t.id === id);

      if (todoIndex !== -1) {
        todoItems[todoIndex].completed = !todoItems[todoIndex].completed;

        await utils.saveToStorage({ 'todos': todoItems });

        const todoItem = document.querySelector(`.todo-item[data-id="${id}"] .todo-text`);
        if (todoItem) {
          todoItem.classList.toggle('completed');
        }
      }
    }

    async function deleteTodo(id) {
      const { todos } = await utils.getFromStorage(['todos']);
      const todoItems = todos || [];
      const filteredTodos = todoItems.filter(t => t.id !== id);

      await utils.saveToStorage({ 'todos': filteredTodos });

      const todoItem = document.querySelector(`.todo-item[data-id="${id}"]`);
      if (todoItem) {
        todoItem.remove();
      }
    }
  }

  return {
    setupTodo
  };
})();

// Weather Module
const weatherModule = (() => {
  async function setupWeather() {
    const weatherTemp = document.getElementById('weather-temp');
    const weatherLocation = document.getElementById('weather-location');

    if (!weatherTemp || !weatherLocation) return;

    try {
      // Try to get saved weather data first
      const { weatherData, weatherTimestamp } = await utils.getFromStorage([
        'weatherData',
        'weatherTimestamp'
      ]);

      const now = Date.now();

      // Use cached data if it's less than an hour old
      if (
        weatherData &&
        weatherTimestamp &&
        (now - weatherTimestamp < CONFIG.WEATHER_API.CACHE_DURATION)
      ) {
        displayWeather(weatherData);
      } else {
        // Otherwise fetch new data
        await getLocation();
      }
    } catch (error) {
      console.error('Weather setup error:', error);
      weatherTemp.textContent = "";
      weatherLocation.textContent = "Weather unavailable";
    }
  }

  function getLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        weatherTemp.textContent = "";
        weatherLocation.textContent = "Geolocation not supported";
        return reject(new Error('Geolocation not supported'));
      }

      navigator.geolocation.getCurrentPosition(
        position => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          fetchWeather(lat, lon)
            .then(resolve)
            .catch(reject);
        },
        error => {
          console.error("Error getting location:", error);
          weatherTemp.textContent = "";
          weatherLocation.textContent = "Location access denied";
          reject(error);
        },
        { timeout: 10000 }
      );
    });
  }

  async function fetchWeather(lat, lon) {
    try {
      const { BASE_URL, API_KEY, UNITS } = CONFIG.WEATHER_API;
      const url = `${BASE_URL}?lat=${lat}&lon=${lon}&units=${UNITS}&appid=${API_KEY}`;

      const data = await utils.fetchWithTimeout(url);

      // Format the response into a simpler object
      const weatherData = {
        main: { temp: data.main.temp },
        name: data.name,
        weather: [{ icon: data.weather[0].icon }]
      };

      // Save weather data to storage
      await utils.saveToStorage({
        'weatherData': weatherData,
        'weatherTimestamp': Date.now()
      });

      displayWeather(weatherData);
      return weatherData;
    } catch (error) {
      console.error('Error fetching weather data:', error);
      weatherTemp.textContent = "";
      weatherLocation.textContent = "Weather data unavailable";
      throw error;
    }
  }

  function displayWeather(data) {
    if (!data || !data.main || !data.name || !data.weather || !data.weather[0]) {
      return;
    }

    const weatherTemp = document.getElementById('weather-temp');
    const weatherLocation = document.getElementById('weather-location');

    if (!weatherTemp || !weatherLocation) return;

    const temp = Math.round(data.main.temp);
    const location = data.name;
    const icon = data.weather[0].icon;

    weatherTemp.innerHTML = `${temp}°C <img src="https://openweathermap.org/img/wn/${icon}.png" alt="Weather icon">`;
    weatherLocation.textContent = location;
  }

  return {
    setupWeather
  };
})();

// Quotes Module
const quotesModule = (() => {
  let currentQuoteData = null; // Store current quote data
  
  async function setupQuotes(isRefresh = false) {
    const quoteText = document.getElementById('quote-text');
    const quoteAuthor = document.getElementById('quote-author');

    if (!quoteText || !quoteAuthor) return;

    try {
      const { quote, quoteTimestamp } = await utils.getFromStorage([
        'quote',
        'quoteTimestamp'
      ]);

      const now = Date.now();
      
      // Store current quote
      currentQuoteData = quote;

      if (
        quote &&
        quoteTimestamp &&
        (now - quoteTimestamp < CONFIG.QUOTE_API.CACHE_DURATION) &&
        !isRefresh
      ) {
        displayQuote(quote);
        updateFavoriteQuoteButton();
      } else {
        await fetchQuote();
      }
    } catch (error) {
      console.error('Error in quotes module:', error);
      displayFallbackQuote();
    }
  }

  async function fetchQuote() {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "getQuote" }, (res) => {
          if (res?.quote) {
            resolve(res.quote);
          } else {
            reject(res?.error || "Unknown error");
          }
        });
      });

      const quoteData = response[0]; // zenquotes.io returns an array
      
      // Add unique ID and date to the quote data
      quoteData.id = Date.now().toString();
      quoteData.date = new Date().toISOString();
      
      // Store current quote
      currentQuoteData = quoteData;

      await utils.saveToStorage({
        'quote': quoteData,
        'quoteTimestamp': Date.now()
      });

      displayQuote(quoteData);
      updateFavoriteQuoteButton();
    } catch (error) {
      console.error('Error fetching quote:', error);
      displayFallbackQuote();
    }
  }

  // Quotes Module - Ensure the favorite button is updated after quote is displayed
  function displayQuote(data) {
    if (!data || !data.q || !data.a) {
      return displayFallbackQuote();
    }

    const quoteText = document.getElementById('quote-text');
    const quoteAuthor = document.getElementById('quote-author');

    if (!quoteText || !quoteAuthor) return;

    quoteText.textContent = `"${utils.sanitizeString(data.q)}"`;
    quoteAuthor.textContent = utils.sanitizeString(data.a);
    
    // Update favorite button immediately after displaying the quote
    setTimeout(() => {
      favoriteQuotesModule.updateFavoriteQuoteButton();
    }, 100);
  }

  function displayFallbackQuote() {
    const quoteText = document.getElementById('quote-text');
    const quoteAuthor = document.getElementById('quote-author');

    if (!quoteText || !quoteAuthor) return;

    quoteText.textContent = "The best way to predict the future is to create it.";
    quoteAuthor.textContent = "Abraham Lincoln";
    
    // Create fallback quote data
    currentQuoteData = {
      q: "The best way to predict the future is to create it.",
      a: "Abraham Lincoln",
      id: "fallback",
      date: new Date().toISOString()
    };
    
    updateFavoriteQuoteButton();
  }
  
  // Get the current quote data
  function getCurrentQuoteData() {
    return currentQuoteData;
  }
  
  // Update favorite button state
  function updateFavoriteQuoteButton() {
    if (!currentQuoteData) return;
  
    // Check if current quote is in favorites
    favoriteQuotesModule.checkIsQuoteFavorite(currentQuoteData.id)
      .then(isFavorite => {
        const favoriteBtn = document.getElementById('favorite-current-quote');
        if (favoriteBtn) {
          if (isFavorite) {
            favoriteBtn.classList.add('active');
          } else {
            favoriteBtn.classList.remove('active');
          }
        }
      });
  }

  return {
    setupQuotes,
    getCurrentQuoteData,
    updateFavoriteQuoteButton
  };
})();

// Favorites Module - completely revised version
const favoritesModule = (() => {
  function setupFavorites() {
    const favoritesButton = document.getElementById('favorites-button');
    const favoritesPanel = document.getElementById('favorites-panel');
    const favoritesClose = document.getElementById('favorites-close');
    const favoriteCurrentBtn = document.getElementById('favorite-current-bg');
    
    if (!favoritesButton || !favoritesPanel || !favoritesClose || !favoriteCurrentBtn) return;

    // Toggle favorites panel
    favoritesButton.addEventListener('click', function() {
      favoritesPanel.classList.toggle('hidden');
      loadFavorites();
    });

    // Close favorites panel
    favoritesClose.addEventListener('click', function() {
      favoritesPanel.classList.add('hidden');
    });

    // Add current background to favorites
    favoriteCurrentBtn.addEventListener('click', function() {
      toggleCurrentBackgroundFavorite();
    });

    // Initial load of favorites button state
    updateFavoriteButton();
    
    // Set up tabs functionality
    const tabBackgrounds = document.getElementById('tab-backgrounds');
    const tabQuotes = document.getElementById('tab-quotes');
    const tabContentBackgrounds = document.getElementById('tab-content-backgrounds');
    const tabContentQuotes = document.getElementById('tab-content-quotes');
    
    if (tabBackgrounds && tabQuotes && tabContentBackgrounds && tabContentQuotes) {
      // Switch to backgrounds tab
      tabBackgrounds.addEventListener('click', function() {
        tabBackgrounds.classList.add('active');
        tabQuotes.classList.remove('active');
        tabContentBackgrounds.classList.add('active');
        tabContentQuotes.classList.remove('active');
        loadFavorites();
      });
      
      // Switch to quotes tab
      tabQuotes.addEventListener('click', function() {
        tabQuotes.classList.add('active');
        tabBackgrounds.classList.remove('active');
        tabContentQuotes.classList.add('active');
        tabContentBackgrounds.classList.remove('active');
        favoriteQuotesModule.loadFavoriteQuotes();
      });
    }
  }

  // New method to toggle current background as favorite
  async function toggleCurrentBackgroundFavorite() {
    // Get the current background image from the DOM
    const currentBackgroundUrl = document.body.style.backgroundImage.replace(/url\(['"](.+)['"]\)/, '$1');
    if (!currentBackgroundUrl) return;

    const favoriteCurrentBtn = document.getElementById('favorite-current-bg');
    if (!favoriteCurrentBtn) return;

    // Generate a unique ID based on the URL if none exists
    const bgId = `bg-${currentBackgroundUrl.split('/').pop().split('?')[0]}`;

    // Check if already favorited
    const isFavorite = await checkIsFavorite(bgId);

    if (isFavorite) {
      // Remove from favorites if already favorited
      await removeFavorite(bgId);
      favoriteCurrentBtn.classList.remove('active');
    } else {
      // Add to favorites
      const backgroundData = {
        id: bgId,
        url: currentBackgroundUrl,
        thumbnailUrl: currentBackgroundUrl,
        date: new Date().toISOString(),
        description: 'Favorite background image'
      };
      await addFavorite(backgroundData);
      favoriteCurrentBtn.classList.add('active');
    }

    // Reload favorites in case the panel is open
    loadFavorites();
  }

  // Updated method to load favorites
  async function loadFavorites() {
    const favoritesList = document.getElementById('favorites-list');
    if (!favoritesList) return;
    
    favoritesList.innerHTML = '';
    
    const { favorites } = await utils.getFromStorage(['favorites']);
    const favoriteItems = favorites || [];
    
    if (favoriteItems.length === 0) {
      favoritesList.innerHTML = '<div class="empty-favorites">No favorite backgrounds yet.<br>Click the heart icon to add the current background.</div>';
      return;
    }
    
    // Sort by most recently added
    favoriteItems.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    favoriteItems.forEach(favorite => {
      const item = createFavoriteElement(favorite);
      favoritesList.appendChild(item);
    });
  }

  function createFavoriteElement(favorite) {
    // Create favorite item container
    const item = utils.createSafeElement('div', {
      class: 'favorite-item',
      'data-id': favorite.id,
      'title': 'Click to set as background'
    });
    
    // Create thumbnail image
    const img = utils.createSafeElement('img', {
      src: favorite.thumbnailUrl || favorite.url,
      alt: 'Favorite background'
    });
    
    // Create remove button
    const removeBtn = utils.createSafeElement('span', {
      class: 'remove-favorite',
      title: 'Remove from favorites'
    });
    removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
    
    // Event listener for remove button
    removeBtn.addEventListener('click', function(e) {
      e.stopPropagation(); // Prevent setting the background
      removeFavorite(favorite.id).then(() => {
        item.remove();
        
        // Show empty message if the last one was removed
        const favoritesList = document.getElementById('favorites-list');
        if (favoritesList && favoritesList.children.length === 0) {
          favoritesList.innerHTML = '<div class="empty-favorites">No favorite backgrounds yet.<br>Click the heart icon to add the current background.</div>';
        }
        
        // Update favorite button if this was the current background
        updateFavoriteButton();
      });
    });
    
    // Event listener for setting as background
    item.addEventListener('click', function() {
      setBackgroundFromFavorite(favorite);
      
      // Close favorites panel
      const favoritesPanel = document.getElementById('favorites-panel');
      if (favoritesPanel) {
        favoritesPanel.classList.add('hidden');
      }
    });
    
    // Assemble favorite item
    item.appendChild(img);
    item.appendChild(removeBtn);
    
    return item;
  }

  function setBackgroundFromFavorite(favorite) {
    if (!favorite || !favorite.url) return;
    
    // Set the background
    const img = new Image();
    img.onload = function () {
      document.body.style.backgroundImage = `url('${favorite.url}')`;
      
      // Save this background to storage as the current background
      utils.saveToStorage({
        'backgroundImage': favorite.url,
        'backgroundData': favorite,
        'backgroundTimestamp': Date.now()
      }).then(() => {
        // Update current background data in memory
        currentBackgroundData = favorite;
        
        // Update favorite button state
        updateFavoriteButton();
      });
    };
    img.onerror = function () {
      console.error('Failed to load background image');
    };
    img.src = favorite.url;
  }

  async function addFavorite(backgroundData) {
    if (!backgroundData || !backgroundData.id || !backgroundData.url) return;
    
    const { favorites } = await utils.getFromStorage(['favorites']);
    let favoriteItems = favorites || [];
    
    // Check if already exists
    const exists = favoriteItems.some(item => item.id === backgroundData.id);
    if (exists) return;
    
    // Add to favorites
    favoriteItems.push(backgroundData);
    
    // Limit number of favorites (remove oldest first)
    if (favoriteItems.length > CONFIG.FAVORITES.MAX_ITEMS) {
      // Sort by date
      favoriteItems.sort((a, b) => new Date(a.date) - new Date(b.date));
      // Remove oldest
      favoriteItems = favoriteItems.slice(1);
    }
    
    await utils.saveToStorage({ 'favorites': favoriteItems });
  }

  async function removeFavorite(id) {
    if (!id) return;
    
    const { favorites } = await utils.getFromStorage(['favorites']);
    const favoriteItems = favorites || [];
    
    const filteredFavorites = favoriteItems.filter(item => item.id !== id);
    
    await utils.saveToStorage({ 'favorites': filteredFavorites });
  }

  async function checkIsFavorite(id) {
    if (!id) return false;
    
    const { favorites } = await utils.getFromStorage(['favorites']);
    const favoriteItems = favorites || [];
    
    return favoriteItems.some(item => item.id === id);
  }

  // Update favorite button state based on current background
  async function updateFavoriteButton() {
    const favoriteBtn = document.getElementById('favorite-current-bg');
    if (!favoriteBtn) return;

    // Wait until the background image is actually set in the DOM
    // This ensures we have a background to check against
    if (!document.body.style.backgroundImage) {
      setTimeout(updateFavoriteButton, 500); // Try again in 500ms
      return;
    }

    // Get the current background image directly from the DOM
    const currentBackgroundUrl = document.body.style.backgroundImage.replace(/url\(['"](.+)['"]\)/, '$1');
    if (!currentBackgroundUrl) {
      favoriteBtn.classList.remove('active');
      return;
    }

    // Generate ID based on the URL (consistent generation is important)
    const bgId = `bg-${currentBackgroundUrl.split('/').pop().split('?')[0]}`;
    
    // Check if current background is in favorites
    const isFavorite = await checkIsFavorite(bgId);
    
    if (isFavorite) {
      favoriteBtn.classList.add('active');
    } else {
      favoriteBtn.classList.remove('active');
    }
  }

  return {
    setupFavorites,
    addFavorite,
    removeFavorite,
    checkIsFavorite,
    loadFavorites
  };
})();

// Favorite Quotes Module - update updateFavoriteQuoteButton to handle page refresh
const favoriteQuotesModule = (() => {
  function setupFavoriteQuotes() {
    const favoriteCurrentQuoteBtn = document.getElementById('favorite-current-quote');
    
    if (!favoriteCurrentQuoteBtn) return;
    
    // Add current quote to favorites
    favoriteCurrentQuoteBtn.addEventListener('click', function() {
      toggleCurrentQuoteFavorite();
    });
    
    // Initial load of favorite quote button state
    updateFavoriteQuoteButton();
  }

  // New method to toggle current quote as favorite
  async function toggleCurrentQuoteFavorite() {
    const favoriteCurrentQuoteBtn = document.getElementById('favorite-current-quote');
    if (!favoriteCurrentQuoteBtn) return;
    
    // Get current quote text and author directly from the DOM
    const quoteTextElement = document.getElementById('quote-text');
    const quoteAuthorElement = document.getElementById('quote-author');
    
    if (!quoteTextElement || !quoteAuthorElement) return;
    
    const quoteText = quoteTextElement.textContent.trim().replace(/^"|"$/g, '');
    const quoteAuthor = quoteAuthorElement.textContent.trim();
    
    if (!quoteText || !quoteAuthor) return;
    
    // Generate a unique ID for the quote
    const quoteId = `quote-${quoteText.substring(0, 20).replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;
    
    // Check if a similar quote is already favorited
    const isFavorite = await isQuoteAlreadyFavorited(quoteText);
    
    if (isFavorite) {
      // Remove from favorites
      await removeQuoteByText(quoteText);
      favoriteCurrentQuoteBtn.classList.remove('active');
    } else {
      // Add to favorites
      const quoteData = {
        id: quoteId,
        q: quoteText,
        a: quoteAuthor,
        date: new Date().toISOString()
      };
      await addFavoriteQuote(quoteData);
      favoriteCurrentQuoteBtn.classList.add('active');
    }
    
    // Reload favorites in case the panel is open
    loadFavoriteQuotes();
  }
  
  // Check if a quote with similar text is already favorited
  async function isQuoteAlreadyFavorited(quoteText) {
    const { favoriteQuotes } = await utils.getFromStorage(['favoriteQuotes']);
    const favoriteQuoteItems = favoriteQuotes || [];
    
    // Compare the text content (case insensitive)
    return favoriteQuoteItems.some(item => 
      item.q.toLowerCase().trim() === quoteText.toLowerCase().trim()
    );
  }
  
  // Remove a quote by its text
  async function removeQuoteByText(quoteText) {
    const { favoriteQuotes } = await utils.getFromStorage(['favoriteQuotes']);
    const favoriteQuoteItems = favoriteQuotes || [];
    
    const filteredFavorites = favoriteQuoteItems.filter(item => 
      item.q.toLowerCase().trim() !== quoteText.toLowerCase().trim()
    );
    
    await utils.saveToStorage({ 'favoriteQuotes': filteredFavorites });
  }

  // Update favorite quote button state with added debugging
  async function updateFavoriteQuoteButton() {
    const favoriteCurrentQuoteBtn = document.getElementById('favorite-current-quote');
    if (!favoriteCurrentQuoteBtn) {
      console.log('Quote favorite button not found in DOM');
      return;
    }
    
    // Get the current quote text directly from the DOM
    const quoteTextElement = document.getElementById('quote-text');
    const quoteAuthorElement = document.getElementById('quote-author');
    
    if (!quoteTextElement || !quoteAuthorElement) {
      console.log('Quote text or author element not found, retrying later');
      // If quote element isn't ready yet, try again in a moment
      setTimeout(updateFavoriteQuoteButton, 500);
      return;
    }
    
    const quoteText = quoteTextElement.textContent.trim().replace(/^"|"$/g, '');
    const quoteAuthor = quoteAuthorElement.textContent.trim();
    
    if (!quoteText) {
      console.log('No quote text available');
      favoriteCurrentQuoteBtn.classList.remove('active');
      return;
    }
    
    console.log('Checking if quote is favorited:', quoteText);
    
    // Check if current quote is in favorites
    const isFavorite = await isQuoteAlreadyFavorited(quoteText);
    console.log('Is quote favorited?', isFavorite);
    
    if (isFavorite) {
      console.log('Quote is favorited, adding active class');
      favoriteCurrentQuoteBtn.classList.add('active');
    } else {
      console.log('Quote is not favorited, removing active class');
      favoriteCurrentQuoteBtn.classList.remove('active');
    }
  }

  async function loadFavoriteQuotes() {
    const quotesList = document.getElementById('quotes-list');
    if (!quotesList) return;
    
    quotesList.innerHTML = '';
    
    const { favoriteQuotes } = await utils.getFromStorage(['favoriteQuotes']);
    const favoriteQuoteItems = favoriteQuotes || [];
    
    if (favoriteQuoteItems.length === 0) {
      quotesList.innerHTML = '<div class="empty-quotes">No favorite quotes yet.<br>Click the heart icon below a quote to add it to favorites.</div>';
      return;
    }
    
    // Sort by most recently added
    favoriteQuoteItems.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    favoriteQuoteItems.forEach(quote => {
      const item = createFavoriteQuoteElement(quote);
      quotesList.appendChild(item);
    });
  }

  function createFavoriteQuoteElement(quote) {
    // Create favorite item container
    const item = utils.createSafeElement('div', {
      class: 'favorite-quote',
      'data-id': quote.id
    });
    
    // Create quote text element
    const quoteText = utils.createSafeElement('div', {
      class: 'favorite-quote-text'
    }, `"${utils.sanitizeString(quote.q)}"`);
    
    // Create quote author element
    const quoteAuthor = utils.createSafeElement('div', {
      class: 'favorite-quote-author'
    }, utils.sanitizeString(quote.a));
    
    // Create remove button
    const removeBtn = utils.createSafeElement('span', {
      class: 'remove-favorite',
      title: 'Remove from favorites'
    });
    removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
    
    // Event listener for remove button
    removeBtn.addEventListener('click', function() {
      removeQuoteByText(quote.q).then(() => {
        item.remove();
        
        // Show empty message if the last one was removed
        const quotesList = document.getElementById('quotes-list');
        if (quotesList && quotesList.children.length === 0) {
          quotesList.innerHTML = '<div class="empty-quotes">No favorite quotes yet.<br>Click the heart icon below a quote to add it to favorites.</div>';
        }
        
        // Update favorite button if this was the current quote
        updateFavoriteQuoteButton();
      });
    });
    
    // Assemble favorite item
    item.appendChild(quoteText);
    item.appendChild(quoteAuthor);
    item.appendChild(removeBtn);
    
    return item;
  }

  async function addFavoriteQuote(quoteData) {
    if (!quoteData || !quoteData.q || !quoteData.a) return;
    
    const { favoriteQuotes } = await utils.getFromStorage(['favoriteQuotes']);
    let favoriteQuoteItems = favoriteQuotes || [];
    
    // Check if already exists by text
    const exists = await isQuoteAlreadyFavorited(quoteData.q);
    if (exists) return;
    
    // Add to favorites
    favoriteQuoteItems.push(quoteData);
    
    // Limit number of favorites (remove oldest first)
    if (favoriteQuoteItems.length > CONFIG.FAVORITES.MAX_QUOTES) {
      // Sort by date
      favoriteQuoteItems.sort((a, b) => new Date(a.date) - new Date(b.date));
      // Remove oldest
      favoriteQuoteItems = favoriteQuoteItems.slice(1);
    }
    
    await utils.saveToStorage({ 'favoriteQuotes': favoriteQuoteItems });
  }

  async function checkIsQuoteFavorite(id) {
    if (!id) return false;
    
    const { favoriteQuotes } = await utils.getFromStorage(['favoriteQuotes']);
    const favoriteQuoteItems = favoriteQuotes || [];
    
    return favoriteQuoteItems.some(item => item.id === id);
  }

  return {
    setupFavoriteQuotes,
    loadFavoriteQuotes,
    addFavoriteQuote,
    removeQuoteByText,
    isQuoteAlreadyFavorited,
    updateFavoriteQuoteButton,
    checkIsQuoteFavorite
  };
})();

// Settings Menu Module
const settingsMenuModule = (() => {
  function setupSettingsMenu() {
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsDropdown = document.getElementById('settings-dropdown');
    
    if (!settingsToggle || !settingsDropdown) return;
    
    // Toggle settings dropdown
    settingsToggle.addEventListener('click', function(e) {
      e.stopPropagation(); // Prevent clicks from propagating
      settingsToggle.classList.toggle('active');
      settingsDropdown.classList.toggle('hidden');
    });
    
    // Close dropdown when clicking elsewhere on the page
    document.addEventListener('click', function(e) {
      // If click target is not within the dropdown or settings toggle
      if (!settingsDropdown.contains(e.target) && e.target !== settingsToggle && !settingsToggle.contains(e.target)) {
        settingsDropdown.classList.add('hidden');
        settingsToggle.classList.remove('active');
      }
    });
  }
  
  return {
    setupSettingsMenu
  };
})();

// Initialize everything when the DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
  // Initialize all modules
  backgroundModule.setRandomBackground(false);
  clockModule.updateTime();
  clockModule.setupNameListener();
  focusModule.setupFocus();
  todoModule.setupTodo();
  weatherModule.setupWeather();
  quotesModule.setupQuotes(false);
  favoritesModule.setupFavorites();
  favoriteQuotesModule.setupFavoriteQuotes();
  settingsMenuModule.setupSettingsMenu(); // Initialize settings menu

  // Set up refresh buttons
  document.getElementById('refresh-button-image')?.addEventListener('click', function () {
    backgroundModule.setRandomBackground(true);
    // Hide dropdown after clicking
    document.getElementById('settings-dropdown').classList.add('hidden');
    document.getElementById('settings-toggle').classList.remove('active');
  });

  document.getElementById('refresh-button-Quote')?.addEventListener('click', function () {
    quotesModule.setupQuotes(true);
    // Hide dropdown after clicking
    document.getElementById('settings-dropdown').classList.add('hidden');
    document.getElementById('settings-toggle').classList.remove('active');
  });

  // Update favorites button to close the dropdown after opening favorites panel
  document.getElementById('favorites-button')?.addEventListener('click', function() {
    const favoritesPanel = document.getElementById('favorites-panel');
    if (favoritesPanel) {
      favoritesPanel.classList.remove('hidden');
      loadFavorites();
    }
    // Hide dropdown after clicking
    document.getElementById('settings-dropdown').classList.add('hidden');
    document.getElementById('settings-toggle').classList.remove('active');
  });

  // Update time every minute
  setInterval(clockModule.updateTime, CONFIG.UPDATE_INTERVALS.TIME);
  
  // Ensure favorite buttons are updated when the page is fully loaded
  setTimeout(() => {
    console.log("Running delayed favorite status check");
    favoritesModule.updateFavoriteButton();
    favoriteQuotesModule.updateFavoriteQuoteButton();
  }, 1000);
});