const container = document.getElementById('channels');

const groups = {
  RAI: 'RAI',
  MEDIASET: 'MEDIASET',
  ALTRI: 'ALTRI CANALI'
};

async function initialize() {
  const channels = await window.easyTV.getChannels();

  for (const [groupId, groupName] of Object.entries(groups)) {
    const groupChannels = channels.filter(
      channel => channel.group === groupId
    );

    const section = document.createElement('section');
    section.className = 'group';

    const title = document.createElement('h2');
    title.textContent = groupName;

    const grid = document.createElement('div');
    grid.className = 'channels';

    for (const channel of groupChannels) {
      const button = document.createElement('button');
      button.className = 'channel';

      const logo = document.createElement('img');
      logo.className = 'channel-logo';
      logo.src = `../../assets/icons/${channel.logo}`;
      logo.alt = channel.name;

      button.append(logo);

      button.addEventListener('click', () => {
        window.easyTV.openChannel(channel.id);
      });

      grid.appendChild(button);
    }

    section.append(title, grid);
    container.appendChild(section);
  }
}

initialize().catch(error => {
  console.error('EasyTV initialization error:', error);
});
