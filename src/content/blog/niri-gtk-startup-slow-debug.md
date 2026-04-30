---
title: "排查 GTK 应用在 niri 中首次启动缓慢"
description: "在 NixOS + niri 环境中，因 xdg-desktop-portal 默认后端误设为 gnome 导致首次启动超时，改为 gtk 后解决。"
pubDate: "2026-04-30"
tags: ["Linux", "NixOS", "Wayland", "niri"]
---

最近我在 NixOS + niri 的 Wayland 环境里碰到一个挺烦人的现象：`nautilus` 第一次启动很慢，但第二次再开就明显正常了。一开始我没有太在意。我下意识觉得这大概只是“首次启动”的缓存或初始化成本，等服务热起来就好了。后来我才发现，事情没有这么简单：**只要当前是首个窗口，它大概率还是会慢**，这时候我才决定认真排查一下。

## 现象

首次启动 `nautilus` 时，终端里会出现这些日志：

```console
** Message: 14:34:40.692: Connecting to org.freedesktop.Tracker3.Miner.Files
nautilus-application-Message: 14:34:40.693: Failed to initialize display server connection: GDBus.Error:org.freedesktop.DBus.Error.InvalidArgs: Invalid service client type
open-any-terminal: terminal is set to "ghostty" opening a new window
MESA-INTEL: warning: ../src/intel/vulkan/anv_formats.c:981: FINISHME: support more multi-planar formats with DRM modifiers
MESA-INTEL: warning: ../src/intel/vulkan/anv_formats.c:949: FINISHME: support YUV colorspace with DRM format modifiers

** (org.gnome.Nautilus:1399494): WARNING **: 14:34:43.114: Unable to create connection for session-wide Tracker indexer: The name org.freedesktop.Tracker3.Miner.Files was not provided by any .service files
```

第二次启动时，表现就完全不一样了：

```console
** Message: 14:35:01.930: Connecting to org.freedesktop.Tracker3.Miner.Files
```

它还是会连 Tracker，但整体速度已经正常很多。这个差异让我更倾向于把问题看成是 **某个会话服务在首次激活时卡住了**，而不是 Nautilus 每次都在做重活。

## 我最开始怀疑的方向

刚看到这些日志时，我主要怀疑了三个方向：

1. Tracker 没有及时起来
2. Mesa / Vulkan 初始化有额外开销
3. `xdg-desktop-portal` 的配置有问题

Mesa 的 warning 只是某些功能还未实现，不像真正拖慢启动的核心原因。Tracker 也确实在日志里出现了，不过它更像是“被动等待”的一部分，而不是根本问题。真正让我停下来重新看配置的，是 `Failed to initialize display server connection` 这一类信息。它不像普通的文件索引问题，更像是某个桌面集成路径在试图和当前会话对接，但对接对象不对。

## 查服务状态

接着我看了用户会话里的相关服务：

```bash
systemctl --user status xdg-desktop-portal xdg-desktop-portal-gtk xdg-desktop-portal-gnome tracker-miner-fs-3
```

关键部分大致是这样：

```text
xdg-desktop-portal.service - Portal service
  Active: active (running)
  ...

xdg-desktop-portal-gtk.service - Portal service (GTK/GNOME implementation)
  Active: active (running)
  ...

xdg-desktop-portal-gnome.service - Portal service (GNOME implementation)
  Active: active (running)
  ...
  Error from gnome-shell: Cannot invoke method; proxy is for the well-known name org.gtk.Notifications ...
  Failed to associate portal window with parent window
```

这时候方向就开始清晰了。`xdg-desktop-portal-gtk` 在跑，说明基础 portal 没问题；但 `xdg-desktop-portal-gnome` 也在跑，而且日志里持续有 GNOME Shell 相关错误。问题不是“portal 不存在”，而是 **portal 在当前会话里选了不合适的后端**。这也和我当时的环境吻合：我已经从 GNOME 切到了 niri，但配置里还保留了 GNOME 相关的默认 portal 选择。

## 找到配置源头

最后我回到 NixOS 配置，发现问题出在另一个模块 `flatpak.nix` 里：

```nix
{pkgs, ...}: {
  config = {
    services.flatpak.enable = true;
    fonts.fontDir.enable = true;

    xdg.portal = {
      enable = true;
      xdgOpenUsePortal = true;
      extraPortals = with pkgs; [xdg-desktop-portal-gnome];
      config.common.default = "gnome";
    };
  };
}
```

这里最关键的是这一行：`config.common.default = "gnome";` 这意味着系统会把 portal 请求默认交给 GNOME backend。对于 GNOME 会话来说，这没什么问题；但我现在是在 niri 里，GNOME backend 的很多假设都不成立。于是某些 GTK 应用第一次启动时，会先经历一轮 D-Bus 激活、backend 选择、失败回退或等待超时，体感上就成了“第一次很慢”。

## 为什么第二次会快很多

这点我后来也想明白了：第一次启动时，portal 相关服务要被激活，后端要选择，可能还要走一次失败路径；等这些服务已经起来以后，第二次再启动应用时，很多东西都已经常驻了，所以速度立刻恢复正常。所以它看起来像“缓存”，但本质上并不是应用本身做了什么缓存优化，而是 **会话服务已经完成初始化**。

## 修复

我最后的修复方式其实很简单：**把 portal 的默认 backend 从 `gnome` 改回 `gtk`，同时保留 gnome 作为可选 backend**。我把这部分单独拆到了一个 `xdg-portal.nix` 里：

```nix
{pkgs, ...}: {
  xdg.portal = {
    enable = true;
    xdgOpenUsePortal = true;
    extraPortals = with pkgs; [
      xdg-desktop-portal-gtk
      # recommended by upstream, required for screencast support
      # https://github.com/YaLTeR/niri/wiki/Important-Software#portals
      xdg-desktop-portal-gnome
    ];
    config.common.default = "gtk";
  };
}
```
