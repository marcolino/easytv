const container = document.getElementById('channels');
const shell = document.getElementById('app-shell');

const groups = {
  RAI: 'RAI',
  MEDIASET: 'MEDIASET',
  ALTRI: 'ALTRI CANALI'
};

let layoutScheduled = false;
function fitLayout() {
  // Measure at natural size; zoom affects layout, so reset it first.
  shell.style.zoom = '1';
  const naturalWidth = shell.scrollWidth;
  const naturalHeight = shell.scrollHeight;
  const margin = 12;
  const scale = Math.max(0.01, Math.min(
    (window.innerWidth - margin * 2) / naturalWidth,
    (window.innerHeight - margin * 2) / naturalHeight
  ));
  shell.style.zoom = String(scale);
}

function scheduleFit() {
  if (layoutScheduled) return;
  layoutScheduled = true;
  requestAnimationFrame(() => {
    layoutScheduled = false;
    fitLayout();
  });
}

async function initialize() {
  const [channels, info] = await Promise.all([
    window.easyTV.getChannels(),
    window.easyTV.getAppInfo()
  ]);

  document.getElementById('app-version').textContent =
    `${info.version} · build ${info.build}`;
  document.title = `EasyTV ${info.version} · build ${info.build}`;

  window.easyTV.onMainFullscreenChanged(scheduleFit);
  window.addEventListener('resize', scheduleFit);

  for (const [groupId, groupName] of Object.entries(groups)) {
    const groupChannels = channels.filter(channel => channel.group === groupId);
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
      logo.draggable = false;
      logo.addEventListener('load', scheduleFit, { once: true });
      button.append(logo);
      const number = document.createElement('span');
      number.className = 'channel-number';
      number.textContent = channel.number;
      button.append(number);
      button.addEventListener('click', () => window.easyTV.openChannel(channel.id));
      grid.appendChild(button);
    }

    section.append(title, grid);
    container.appendChild(section);
  }

  scheduleFit();
  // If fonts load after the initial layout, fit again.
  document.fonts?.ready?.then(scheduleFit);
}

initialize().catch(error => console.error('EasyTV initialization error:', error));
