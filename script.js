const peopleList = document.getElementById('people-list');
const addPersonBtn = document.getElementById('add-person-btn');
const clearListBtn = document.getElementById('clear-list-btn');

function addPerson(name, amount) {
    const listItem = document.createElement('div');
    listItem.classList.add('personlist-item');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    nameSpan.classList.add('name-span');

    const dollarSpan = document.createElement('span');
    dollarSpan.textContent = '$';
    dollarSpan.classList.add('dollar-sign');

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.placeholder = 'Enter amount...';
    amountInput.classList.add('amount-input');
    amountInput.value = amount || 0;

    amountInput.addEventListener('input', debounce(saveListToLocalStorage, 300));

    const nameAmountContainer = document.createElement('div');
    nameAmountContainer.appendChild(nameSpan);
    nameAmountContainer.appendChild(dollarSpan);
    nameAmountContainer.appendChild(amountInput);

    listItem.appendChild(nameAmountContainer);

    const removeBtn = document.createElement('a');
    removeBtn.textContent = 'Clear';
    removeBtn.classList.add('remove-btn');
    removeBtn.addEventListener('click', () => {
        peopleList.removeChild(listItem);
        saveListToLocalStorage();
    });

    listItem.appendChild(removeBtn);
    peopleList.appendChild(listItem);
}

addPersonBtn.addEventListener('click', () => {
    const name = prompt("Enter Person's Name:");
    if (!name || name.trim() === '') {
        alert('Name cannot be empty');
        return;
    }
    const amount = parseFloat(prompt("Enter Amount:"));
    if (isNaN(amount) || amount < 0) {
        alert('Please enter a valid amount');
        return;
    }
    addPerson(name, amount);
    saveListToLocalStorage();
});

clearListBtn.addEventListener('click', () => {
    peopleList.innerHTML = '';
    saveListToLocalStorage();
});

function saveListToLocalStorage() {
    const listItems = peopleList.querySelectorAll('.personlist-item');
    const peopleData = [];

    listItems.forEach(item => {
        const name = item.querySelector('.name-span').textContent;
        const amount = parseFloat(item.querySelector('.amount-input').value) || 0;
        peopleData.push({ name, amount });
    });

    localStorage.setItem('peopleList', JSON.stringify(peopleData));
    console.log('Data saved to local storage');
}

function loadListFromLocalStorage() {
    const peopleData = JSON.parse(localStorage.getItem('peopleList')) || [];
    peopleData.forEach(person => {
        addPerson(person.name, person.amount);
    });
    console.log('Data loaded from local storage');
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Load the list from local storage when the page loads
loadListFromLocalStorage();
