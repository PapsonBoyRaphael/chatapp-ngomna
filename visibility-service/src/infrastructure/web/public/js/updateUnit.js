const unitSearch = document.getElementById('unitSearch');
const unitIdInput = document.getElementById('unitId');
const suggestionsList = document.getElementById('unitSuggestions');

let debounceTimeout;

unitSearch.addEventListener('input', () => {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(async () => {
    const query = unitSearch.value.trim();
    if (query.length < 2) {
      suggestionsList.innerHTML = '';
      suggestionsList.classList.add('hidden');
      return;
    }

    try {
      const response = await fetch(`/units/search?q=${encodeURIComponent(query)}`);
      const units = await response.json();
      suggestionsList.innerHTML = '';
      if (units.length === 0) {
        suggestionsList.classList.add('hidden');
        return;
      }

      units.forEach(unit => {
        const li = document.createElement('li');
        li.className = 'px-4 py-2 hover:bg-green-100 cursor-pointer';
        li.textContent = unit.name + (unit.acronyme ? ` (${unit.acronyme})` : '');
        li.addEventListener('click', () => {
          unitSearch.value = unit.name;
          unitIdInput.value = unit.id;
          suggestionsList.innerHTML = '';
          suggestionsList.classList.add('hidden');
        });
        suggestionsList.appendChild(li);
      });
      suggestionsList.classList.remove('hidden');
    } catch (error) {
      console.error('Search error:', error);
      suggestionsList.innerHTML = '';
      suggestionsList.classList.add('hidden');
    }
  }, 300);
});