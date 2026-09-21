(function () {
  var MESSAGE_TYPE = 'ai-project-hub:briefing-navigate'

  function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim()
  }

  function clickNavigation(labels) {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('aside.sidebar nav button'))
    for (var labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
      var label = labels[labelIndex]
      var target = buttons.find(function (button) {
        return compactText(button.textContent).indexOf(label) >= 0 && !button.disabled
      })
      if (target) {
        target.click()
        return true
      }
    }
    return false
  }

  function reactProjectId(row) {
    var node = row
    while (node) {
      var fiberKey = Object.keys(node).find(function (key) { return key.indexOf('__reactFiber$') === 0 })
      var fiber = fiberKey ? node[fiberKey] : null
      var depth = 0
      while (fiber && depth < 16) {
        var id = Number(fiber.key)
        if (Number.isInteger(id) && id > 0) return id
        fiber = fiber.return
        depth += 1
      }
      node = node.parentElement
    }
    return 0
  }

  function openProject(projectId) {
    var expectedId = Number(projectId || 0)
    if (!Number.isInteger(expectedId) || expectedId <= 0) return
    if (typeof window.__legacyOpenProject === 'function') {
      var request = window.__legacyOpenProject(expectedId)
      window.__legacyProjectDetailReturn = { page: 'projects', scope: 'all' }
      void Promise.resolve(request).catch(function (error) {
        console.error('[daily-briefing] unable to open project detail', error)
      })
      return
    }

    clickNavigation(['全部项目', '项目中心'])

    var attempts = 0
    var timer = window.setInterval(function () {
      attempts += 1
      var rows = Array.prototype.slice.call(document.querySelectorAll('article.project-row'))
      var target = rows.find(function (row) { return reactProjectId(row) === expectedId })
      if (target) {
        window.clearInterval(timer)
        target.click()
      } else if (attempts >= 30) {
        window.clearInterval(timer)
      }
    }, 100)
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin || event.source !== window.parent) return
    var data = event.data || {}
    if (data.type !== MESSAGE_TYPE) return

    if (data.actionKind === 'open_alerts') {
      clickNavigation(['异常处理', '预警中心'])
      return
    }
    openProject(data.projectId)
  })
})()
