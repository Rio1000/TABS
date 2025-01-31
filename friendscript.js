
function toggleFriendInfo(button) {
    const infoDiv = button.nextElementSibling;
    const icon = button.querySelector('span');

    // Toggle the display of the friend's info
    if (infoDiv.style.display === 'none' || infoDiv.style.display === '') {
        infoDiv.style.display = 'block';
        icon.textContent = 'arrow_drop_up';  // Change to up arrow
    } else {
        infoDiv.style.display = 'none';
        icon.textContent = 'arrow_drop_down';  // Change back to down arrow
    }
}
