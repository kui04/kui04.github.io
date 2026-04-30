---
title: "排查 GTK 应用在 niri 中首次启动缓慢"
description: "NixOS + niri 环境下 GTK 应用首次启动缓慢的排查过程：从误判 xdg-desktop-portal 到最终定位 MESA + Vulkan 渲染器问题，通过 GSK_RENDERER=gl 修复。"
pubDate: "2026-04-30"
tags: ["Linux", "NixOS", "Wayland", "GTK"]
---

最近我在 NixOS + niri 的 Wayland 环境里碰到一个挺烦人的现象：`nautilus` 第一次启动很慢，但第二次再开就明显正常了。一开始我没有太在意，下意识觉得这大概只是"首次启动"的缓存或初始化成本，等服务热起来就好了。后来我才发现，事情没有这么简单：**只要当前是首个窗口，它大概率还是会慢**，这时候我才决定认真排查一下。

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

它还是会连 Tracker，但整体速度已经正常很多。

## 初步排查

刚看到这些日志时，我主要怀疑了三个方向：

1. Tracker 没有及时起来
2. Mesa / Vulkan 初始化有额外开销
3. `xdg-desktop-portal` 的配置有问题

Tracker 也确实在日志里出现了，不过它更像是"被动等待"的一部分，而不是根本问题。`Failed to initialize display server connection` 这条错误看起来像某个桌面集成路径在试图和当前会话对接，但对接对象不对。当时 Mesa 那一堆 `FINISHME` 是 warning 级别，我觉得只是某些功能未实现，不像真正拖慢启动的核心原因——于是我把注意力放在了第三条：portal 配置上。

## 怀疑 xdg-desktop-portal

接着我看了用户会话里的相关服务：

```bash
systemctl --user status xdg-desktop-portal xdg-desktop-portal-gtk xdg-desktop-portal-gnome
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

`xdg-desktop-portal-gnome` 的日志里持续有 GNOME Shell 相关错误。当时我已经从 GNOME 切到了 niri，但配置里还保留了 GNOME 相关的默认 portal 选择。我找到配置在 `flatpak.nix` 里：

```nix
{ pkgs, ... }: {
  config = {
    services.flatpak.enable = true;
    fonts.fontDir.enable = true;

    xdg.portal = {
      enable = true;
      xdgOpenUsePortal = true;
      extraPortals = with pkgs; [ xdg-desktop-portal-gnome ];
      config.common.default = "gnome";
    };
  };
}
```

于是我做了这样一系列操作：把 portal 默认 backend 从 `gnome` 改成了 `gtk`，把配置单独拆到 `xdg-portal.nix` 里，并且加上注释。当时我觉得问题已经解决了——portal 服务在非 GNOME 会话里选了错误的后端，初始化时走了一轮失败回退，所以首次启动慢；第二次再开时服务已经起来了，自然就快了, **然而事实并非如此。**。

## 被我忽略的 MESA 警告

在 portal "修复"后的一次使用中，我注意到几个之前没在意的细节：

1. **Chrome 也报了 Vulkan 相关警告**，终端里出现了 `--ozone-platform=wayland` 与 Vulkan 不兼容的提示。这意味着 Vulkan 渲染路径在 Wayland 下存在某种兼容性问题，而且不只影响 GTK 应用。

2. **File Roller 也有同样的 MESA 警告**，终端里出现了和 nautilus 一模一样的 `MESA-INTEL: warning`：

```
MESA-INTEL: warning: ../src/intel/vulkan/anv_formats.c:981: FINISHME: support more multi-planar formats with DRM modifiers
MESA-INTEL: warning: ../src/intel/vulkan/anv_formats.c:949: FINISHME: support YUV colorspace with DRM format modifiers
```

回头看最初的日志，MESA 的 warning 从来就没消失过——不管 portal 配置怎么改，它一直都在。我之前把它当成无害的 warning 忽略了，但现在 Chrome 的 Vulkan 兼容性警告和 file-roller 同款 MESA 报错让我开始怀疑。

## 顺藤摸瓜

带着这两个 `warning`，很快就搜到了相关的 issue：

- [GNOME Discourse: GNOME 48 graphics issues (mesa)](https://discourse.gnome.org/t/gnome-48-graphics-issues-mesa/29300) — 有用户报告 GNOME 48 下 GTK 应用出现渲染异常，同样是 MESA-INTEL 的 `FINISHME` 警告，修复方式也是设置 `GSK_RENDERER=gl`

- [MESA GitLab: hasvk corrupted graphics for gtk4 apps in vulkan renderer](https://gitlab.freedesktop.org/mesa/mesa/-/work_items/13319) — MESA 上游确认了 hasvk（Intel 旧平台 Vulkan 驱动）在 GTK4 的 Vulkan 渲染器下存在渲染异常，相关 commit 曾被合入后又 revert，说明问题仍在修复中

- [Arch Linux Forums: Gnome 47 Apps doesn't launch until vulkan-intel is uninstalled](https://bbs.archlinux.org/viewtopic.php?id=299546) — Arch 用户遇到同样的问题：GTK 应用在安装 `vulkan-intel` 后无法启动，卸载后正常。讨论中有人指出 GNOME 47 开始将 Vulkan 渲染设为默认，设置 `GSK_RENDERER=ngl` 可以绕过问题

所以大概率就是 Mesa 的问题了，这个问题暂时还没有解决，临时修复下：强制 GTK 使用 OpenGL 进行渲染：

```nix
environment.variables = {
  # Force GTK to use the GL renderer, and related issue: https://gitlab.freedesktop.org/mesa/mesa/-/work_items/13319
  GSK_RENDERER = "gl";
};
```
